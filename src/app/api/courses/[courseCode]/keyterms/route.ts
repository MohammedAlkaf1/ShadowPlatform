import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/courses/:courseCode/keyterms — student-facing (Flutter app),
 * dual-auth. Returns a flat list of approved lecture keyterms for
 * `courseCode`, meant to be sent to Deepgram as a keyterm boost-list
 * alongside each speech-to-text request (see the feature's overall design:
 * no model retraining, just keyterm boosting on the transcription request
 * itself).
 *
 * There is no separate "course" entity in this schema (see
 * prisma/schema.prisma's FacultyCourseLink/Exam comments) — `courseCode` is
 * a plain string, and a student proves enrollment via a real
 * FacultyCourseLink row. Unlike the faculty-side GET /api/faculty/keyterms
 * (scoped to ONE faculty member's own glossary), this aggregates keyterms
 * across EVERY faculty member the student has a real link to for this
 * courseCode — mirroring GET /api/student/exams's same "OR across all my
 * links for this code" approach, since a student's course enrollment isn't
 * tied to a single faculty member in this schema.
 *
 * Only APPROVED terms are ever returned (LectureKeyterm.approved = true) —
 * an AI-extracted draft the faculty member hasn't reviewed yet is invisible
 * here, same "never auto-publish AI output" rule as the exam feature.
 */
export async function GET(request: Request, { params }: { params: Promise<{ courseCode: string }> }) {
  const { courseCode } = await params;

  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const links = await db.facultyCourseLink.findMany({
    where: { studentProfileId: studentProfile.id, courseCode },
    select: { facultyUserId: true },
  });
  if (links.length === 0) {
    // Same "don't confirm existence" posture as the rest of this API: a
    // courseCode the student isn't enrolled in returns 404, indistinguishable
    // from a courseCode nobody has ever created keyterms for.
    return NextResponse.json({ error: "لم يتم العثور على المقرر" }, { status: 404 });
  }

  const keyterms = await db.lectureKeyterm.findMany({
    where: {
      courseCode,
      approved: true,
      deletedAt: null,
      facultyUserId: { in: links.map((l) => l.facultyUserId) },
    },
    orderBy: { term: "asc" },
    select: { term: true },
  });

  return NextResponse.json({ terms: keyterms.map((k) => k.term) });
}
