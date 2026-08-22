import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/faculty/exams/:id/results — every student who has an
 * ExamSubmission for this exam (started or completed), with name, submitted
 * time, score, and status. Faculty-authoring view only, same ownership rule
 * as GET/PUT /api/faculty/exams/:id: the exam's own facultyUserId must match
 * the caller, checked directly (not assertFacultyTeachesCourse, which only
 * proves "teaches this courseCode somewhere" — this route needs "owns THIS
 * specific exam"). Not found (never 403) for any exam this faculty member
 * doesn't own, same posture as the sibling routes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = await params;

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
  const exam = await db.exam.findUnique({ where: { id: examId } });
  if (!exam || exam.deletedAt || exam.facultyUserId !== ctx.userId) {
    return NextResponse.json({ error: "لم يتم العثور على الاختبار" }, { status: 404 });
  }

  const totalQuestions = await db.question.count({ where: { examId } });

  const submissions = await db.examSubmission.findMany({
    where: { examId },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    include: {
      student: { select: { fullName: true, email: true } },
      // Correct count is re-derived from the answers themselves (not just
      // trusting the stored `score`) so the "X/Y" breakdown always matches
      // what `score` was computed from — see the completion-time scoring
      // note in POST /api/exams/:id/answers.
      answers: { select: { selectedOption: { select: { isCorrect: true } } } },
    },
  });

  return NextResponse.json({
    results: submissions.map((s) => ({
      submissionId: s.id,
      studentName: s.student.fullName,
      studentEmail: s.student.email,
      status: s.status,
      submittedAt: s.completedAt,
      score: s.score,
      correctCount: s.answers.filter((a) => a.selectedOption?.isCorrect === true).length,
      totalQuestions,
    })),
  });
}
