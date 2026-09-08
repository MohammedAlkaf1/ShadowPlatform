import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertStudentEnrolledInCourse, FacultyAccessError } from "@/lib/faculty-access";

/**
 * GET /api/exams/:id/questions — student-facing (Flutter app), dual-auth
 * (mobile Bearer JWT or web session, see requireApiRole). Returns the
 * exam's questions/options WITHOUT `isCorrect` ever appearing anywhere in
 * the response — shaped explicitly field-by-field below (never a raw
 * ...spread of the Prisma row), same discipline this codebase already
 * applies to the student-facing classification-withholding rule elsewhere
 * (see tests/helpers.ts's assertNoRawClassificationLeak, which the
 * permission test for this route reuses).
 *
 * A student may only see a PUBLISHED exam (availableAt set and <= now —
 * see prisma/schema.prisma's Exam model comment for the draft/scheduled/
 * published semantics) they are actually enrolled in, proven by a real
 * FacultyCourseLink to the exam's facultyUserId+courseCode — not just any
 * enrollment, and not a draft/scheduled exam even if enrolled.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tErrors = await getTranslations("Common.errors");
  const { id } = await params;

  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const exam = await db.exam.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });

  // Same "don't confirm existence" posture used elsewhere in this API
  // (e.g. GET /api/student/faculty-resources/:id/download): a draft/
  // scheduled exam, a soft-deleted exam, and a genuinely nonexistent id
  // all return the identical 404 — never distinguishable from outside.
  if (!exam || exam.deletedAt || !exam.availableAt || exam.availableAt.getTime() > Date.now()) {
    return NextResponse.json({ error: tErrors("examNotFound") }, { status: 404 });
  }

  try {
    await assertStudentEnrolledInCourse(ctx, exam.facultyUserId, exam.courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: tErrors("examNotFound") }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({
    exam: {
      id: exam.id,
      title: exam.title,
      courseCode: exam.courseCode,
      questions: exam.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        order: q.order,
        // Explicit field list — id/text/order ONLY. isCorrect is
        // deliberately never referenced here, not even to omit it via
        // destructuring (which would still touch the field name in code
        // and risk a future accidental ...rest spread reintroducing it).
        options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
      })),
    },
  });
}
