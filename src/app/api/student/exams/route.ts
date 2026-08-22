import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/student/exams — student-facing (Flutter app), dual-auth (mobile
 * Bearer JWT or web session, see requireApiRole). Lists every PUBLISHED
 * exam (availableAt set and <= now — same draft/scheduled/published
 * semantics as GET /api/exams/:id/questions) that the calling student is
 * actually enrolled in, proven by a real FacultyCourseLink to the exam's
 * facultyUserId+courseCode — mirrors assertStudentEnrolledInCourse's rule,
 * just applied as a list filter instead of a single-exam assertion (a
 * distinct-pairs join would be more "correct" SQL, but with the tenant's
 * expected exam/link volume a straightforward in-memory intersection over
 * two small queries is simpler to read and verify than a raw query).
 *
 * Also surfaces the calling student's own ExamSubmission status/id per exam
 * (null if not started yet) so the app can show "لم تبدأ" / "قيد التنفيذ" /
 * "تم التسليم" without a second round-trip per exam.
 */
export async function GET(request: Request) {
  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const links = await db.facultyCourseLink.findMany({
    where: { studentProfileId: studentProfile.id },
    select: { facultyUserId: true, courseCode: true },
  });
  if (links.length === 0) {
    return NextResponse.json({ exams: [] });
  }

  const exams = await db.exam.findMany({
    where: {
      deletedAt: null,
      availableAt: { not: null, lte: new Date() },
      OR: links.map((l) => ({ facultyUserId: l.facultyUserId, courseCode: l.courseCode })),
    },
    orderBy: { availableAt: "desc" },
    include: {
      _count: { select: { questions: true } },
      submissions: { where: { studentUserId: ctx.userId }, select: { id: true, status: true } },
    },
  });

  return NextResponse.json({
    exams: exams.map((e) => ({
      id: e.id,
      title: e.title,
      courseCode: e.courseCode,
      availableAt: e.availableAt,
      questionCount: e._count.questions,
      submission: e.submissions[0]
        ? { id: e.submissions[0].id, status: e.submissions[0].status }
        : null,
    })),
  });
}
