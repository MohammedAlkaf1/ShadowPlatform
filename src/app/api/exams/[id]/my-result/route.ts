import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertStudentEnrolledInCourse, FacultyAccessError } from "@/lib/faculty-access";

/**
 * GET /api/exams/:id/my-result — student-facing (Flutter app), dual-auth,
 * called after the "submitted" screen in the voice-driven exam flow to
 * decide whether to speak/show a score.
 *
 * Gated on Exam.showResultsToStudents (faculty opt-in, default false — see
 * that field's schema comment): when false, this returns
 * `{ "available": false }` and NOTHING else — no score field present at
 * all, not even null, so a client bug can't accidentally leak a number the
 * faculty member chose to withhold. When true and the caller has a
 * completed ExamSubmission, returns the score plus a correct/total
 * breakdown (same shape the faculty results page shows, see
 * GET /api/faculty/exams/:id/results).
 *
 * Same enrollment/existence rules as GET /api/exams/:id/questions: 404
 * (never distinguishable from "doesn't exist") for a draft/scheduled exam
 * or a student with no real enrollment. A student who hasn't submitted yet
 * also gets `{ "available": false }` — nothing to show until they finish.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = await params;

  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const exam = await db.exam.findUnique({ where: { id: examId } });

  if (!exam || exam.deletedAt || !exam.availableAt || exam.availableAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "لم يتم العثور على الاختبار" }, { status: 404 });
  }

  try {
    await assertStudentEnrolledInCourse(ctx, exam.facultyUserId, exam.courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: "لم يتم العثور على الاختبار" }, { status: 404 });
    }
    throw err;
  }

  if (!exam.showResultsToStudents) {
    return NextResponse.json({ available: false });
  }

  const submission = await db.examSubmission.findUnique({
    where: { examId_studentUserId: { examId, studentUserId: ctx.userId } },
    include: { answers: { select: { selectedOption: { select: { isCorrect: true } } } } },
  });

  if (!submission || submission.status !== "completed" || submission.score === null) {
    return NextResponse.json({ available: false });
  }

  const totalQuestions = await db.question.count({ where: { examId } });
  const correctCount = submission.answers.filter((a) => a.selectedOption?.isCorrect === true).length;

  return NextResponse.json({
    available: true,
    score: submission.score,
    correctCount,
    totalQuestions,
  });
}
