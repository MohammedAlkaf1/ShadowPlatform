import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/faculty/exams/:id — the CALLING faculty member's own exam, full
 * detail including `isCorrect` (this is the faculty-authoring view, not the
 * student-facing one — see /api/exams/:id/questions for the withholding
 * rule that applies there instead). Only the exam's own facultyUserId may
 * view it; there is no admin/specialist read path.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tErrors = await getTranslations("Common.errors");
  const { id } = await params;

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
  const exam = await db.exam.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });

  if (!exam || exam.deletedAt || exam.facultyUserId !== ctx.userId) {
    return NextResponse.json({ error: tErrors("examNotFound") }, { status: 404 });
  }

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      courseCode: exam.courseCode,
      source: exam.source,
      availableAt: exam.availableAt,
      showResultsToStudents: exam.showResultsToStudents,
      createdAt: exam.createdAt,
      questions: exam.questions.map((q) => ({
        id: q.id,
        text: q.text,
        order: q.order,
        options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, order: o.order })),
      })),
    },
  });
}

const optionSchema = z.object({
  text: z.string().trim().min(1),
  isCorrect: z.boolean(),
});
const questionSchema = z.object({
  text: z.string().trim().min(1),
  options: z.array(optionSchema).min(2),
});
const updateExamSchema = z.object({
  title: z.string().trim().min(1),
  questions: z.array(questionSchema).min(1),
  availableAt: z.string().datetime().nullish(),
  showResultsToStudents: z.boolean().default(false),
});

/**
 * PUT /api/faculty/exams/:id — full replace of an exam's title/questions/
 * publish state. Used by the edit flow (e.g. tweaking an AI-generated
 * draft further after the initial save, or publishing a saved draft). The
 * courseCode/facultyUserId/source of an exam are immutable after creation
 * (not accepted here) — only title, questions, and availableAt (draft vs
 * scheduled vs published) can change post-creation.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tErrors = await getTranslations("Common.errors");
  const { id } = await params;

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
  const parsed = updateExamSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  const { title, questions, availableAt, showResultsToStudents } = parsed.data;

  for (const q of questions) {
    const correctCount = q.options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      return NextResponse.json(
        { error: tErrors("examQuestionNeedsOneCorrectAnswer") },
        { status: 400 }
      );
    }
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam || exam.deletedAt || exam.facultyUserId !== ctx.userId) {
    return NextResponse.json({ error: tErrors("examNotFound") }, { status: 404 });
  }

  const wasUnpublished = !exam.availableAt;

  // Replace the whole question tree: delete-then-recreate rather than a
  // per-question diff/merge. Simpler and safe here because no student can
  // have answered yet at this stage of a draft edit — this endpoint is
  // reachable only by the exam's own faculty owner, and the student-facing
  // submit endpoint is a completely separate route that never calls this
  // one. If this exam already had submissions, cascading deletes on
  // Question would also cascade-delete their Answers (schema onDelete:
  // Cascade) — acceptable for a still-unpublished exam, but this endpoint
  // does not special-case a published exam with existing submissions
  // differently; editing a live exam's questions is a faculty judgment
  // call this phase leaves to them.
  await db.$transaction([
    db.question.deleteMany({ where: { examId: id } }),
    db.exam.update({
      where: { id },
      data: {
        title,
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
    }),
  ]);

  if (availableAt && wasUnpublished) {
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "publish_exam",
      resourceType: "Exam",
      resourceId: id,
    });
  }

  return NextResponse.json({ ok: true });
}
