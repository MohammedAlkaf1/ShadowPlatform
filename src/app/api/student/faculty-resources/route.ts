import { NextResponse } from "next/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/student/faculty-resources
 *
 * Returns the calling student's OWN faculty-uploaded resources only —
 * mirrors the auth pattern and response-shape conventions of
 * GET /api/student/profile / GET /api/student/support-plan (Bearer JWT,
 * role=student, never trusting client-supplied ids). There is no query
 * parameter or path that could return another student's resources or even
 * confirm whether another student has any.
 */
export async function GET(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const resources = await db.facultyResource.findMany({
    where: { studentProfileId: studentProfile.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { email: true } } },
  });

  return NextResponse.json({
    resources: resources.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      note: r.note,
      courseCode: r.courseCode,
      uploadedAt: r.createdAt,
      faculty: { email: r.uploadedBy.email },
      downloadUrl: `/api/student/faculty-resources/${r.id}/download`,
    })),
  });
}
