import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertFacultyTeachesCourse, FacultyAccessError } from "@/lib/faculty-access";
import { logAudit } from "@/lib/audit";

const optionSchema = z.object({
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  text: z.string().trim().min(1),
  options: z.array(optionSchema).min(2), // UI enforces "typically 4"; 2 is the hard floor for a meaningful MCQ
});

const createExamSchema = z.object({
  title: z.string().trim().min(1),
  courseCode: z.string().trim().min(1),
  questions: z.array(questionSchema).min(1),
  // Manual-create screen always sends "MANUAL" here; the AI-generation
  // screen's save action also lands on this same endpoint once the
  // teacher approves the draft, sent as "AI_GENERATED" so the Exam row
  // records provenance even though by the time this fires the questions
  // are already teacher-edited, ordinary data (see docs/API.md).
  source: z.enum(["MANUAL", "AI_GENERATED"]).default("MANUAL"),
  // Absent/null = save as draft. ISO datetime = publish (now or scheduled).
  availableAt: z.string().datetime().nullish(),
  // Least-privilege default false, matching Exam.showResultsToStudents'
  // schema default — see that field's comment.
  showResultsToStudents: z.boolean().default(false),
});

/**
 * GET /api/faculty/exams — lists the CALLING faculty member's own exams
 * (every source, every status). No admin/specialist read path exists for
 * this route or any exam route — see prisma/schema.prisma's Exam model
 * comment and the feature's permission rules in docs/API.md.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const exams = await db.exam.findMany({
    where: { facultyUserId: ctx.userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });

  return NextResponse.json({
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      courseCode: e.courseCode,
      source: e.source,
      availableAt: e.availableAt,
      questionCount: e._count.questions,
      createdAt: e.createdAt,
    })),
  });
}

/**
 * POST /api/faculty/exams — creates an exam with its full question/option
 * tree in one call (both the manual-create screen and the AI-generation
 * screen's "approve and save" action call this — by the time either does,
 * the question set is finalized editable data, there is no partial-save
 * per question). Requires the caller to actually teach `courseCode` (any
 * FacultyCourseLink row for this faculty+course — see
 * assertFacultyTeachesCourse), not just role=faculty.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = createExamSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { title, courseCode, questions, source, availableAt, showResultsToStudents } = parsed.data;

  // Every question must have exactly one correct option — checked here,
  // not left to the DB, since QuestionOption.isCorrect has no CHECK
  // constraint enforcing "exactly one per question".
  for (const q of questions) {
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      return NextResponse.json(
        { error: "كل سؤال يجب أن يحتوي على إجابة صحيحة واحدة بالضبط" },
        { status: 400 }
      );
    }
  }

  try {
    await assertFacultyTeachesCourse(ctx, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const examId = randomUUID();

  await db.exam.create({
    data: {
      id: examId,
      tenantId: ctx.tenantId,
      title,
      facultyUserId: ctx.userId,
      courseCode,
      source,
      availableAt: availableAt ? new Date(availableAt) : null,
      showResultsToStudents,
      questions: {
        create: questions.map((q, qIndex) => ({
          text: q.text,
          type: "MCQ",
          order: qIndex,
          options: {
            create: q.options.map((o, oIndex) => ({
              text: o.text,
              isCorrect: o.isCorrect,
              order: oIndex,
            })),
          },
        })),
      },
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create_exam",
    resourceType: "Exam",
    resourceId: examId,
  });

  if (availableAt) {
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "publish_exam",
      resourceType: "Exam",
      resourceId: examId,
    });
  }

  return NextResponse.json({ ok: true, examId }, { status: 201 });
}
