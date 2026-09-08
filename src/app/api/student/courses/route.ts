import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/student/courses — student-facing (Flutter app), dual-auth.
 * Lists the distinct course codes the calling student has a real
 * FacultyCourseLink to. There is no separate Course entity in this schema
 * (see FacultyCourseLink's own comment) — a course is just a courseCode
 * string, so that's all this returns, deduplicated across however many
 * faculty members link the student to the same code.
 *
 * Built for the deaf-mode transcription screen's course picker (needed so
 * the app knows which course's approved keyterms to fetch via
 * GET /api/courses/:courseCode/keyterms before starting a Deepgram
 * session) — same enrollment derivation as GET /api/student/exams, just
 * returning the distinct codes instead of exams filtered by them.
 */
export async function GET(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: tErrors("studentProfileNotFound") }, { status: 404 });
  }

  const links = await db.facultyCourseLink.findMany({
    where: { studentProfileId: studentProfile.id },
    select: { courseCode: true },
    distinct: ["courseCode"],
    orderBy: { courseCode: "asc" },
  });

  return NextResponse.json({ courses: links.map((l) => ({ courseCode: l.courseCode })) });
}
