import { NextResponse } from "next/server";
import { getMobileRequestContext } from "@/lib/api-auth";
import { getRequestContext, type RequestContext } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { getPlainObject } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/student/faculty-resources/:id/download
 *
 * Dual-auth: tries the mobile Bearer JWT first (for the Flutter app), falls
 * back to the web NextAuth session (for the /student/status page's
 * download link, which has no way to attach an Authorization header to a
 * plain browser navigation). Either way it's still ALWAYS the caller's own
 * resource — ownership is re-checked against the resolved student's own
 * StudentProfile.id below regardless of which auth path resolved it.
 */
async function resolveStudentContext(request: Request): Promise<RequestContext | null> {
  const mobileCtx = await getMobileRequestContext(request);
  if (mobileCtx && mobileCtx.role === "student") return mobileCtx;

  const sessionCtx = await getRequestContext();
  if (sessionCtx && sessionCtx.role === "student") return sessionCtx;

  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ctx = await resolveStudentContext(request);
  if (!ctx) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const resource = await db.facultyResource.findUnique({ where: { id } });
  if (!resource || resource.deletedAt) {
    return NextResponse.json({ error: "لم يتم العثور على الملف" }, { status: 404 });
  }
  if (resource.studentProfileId !== studentProfile.id) {
    // Deliberately the SAME 404 as "doesn't exist" — never confirm to a
    // student that a resource id belongs to someone else.
    return NextResponse.json({ error: "لم يتم العثور على الملف" }, { status: 404 });
  }

  const bytes = await getPlainObject(resource.objectKey);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_faculty_resource",
    resourceType: "FacultyResource",
    resourceId: resource.id,
    targetStudentProfileId: resource.studentProfileId,
  });

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": resource.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(resource.originalFilename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
