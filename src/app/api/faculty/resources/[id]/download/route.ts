import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertFacultyLinkedToStudent, FacultyAccessError } from "@/lib/faculty-access";
import { getPlainObject } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/faculty/resources/:id/download — the uploading faculty member's
 * own view/download of a resource. Plaintext (never encrypted, see
 * FacultyResource in prisma/schema.prisma) — streamed straight from
 * storage, no decrypt step.
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
  const resource = await db.facultyResource.findUnique({ where: { id } });
  if (!resource || resource.deletedAt) {
    return NextResponse.json({ error: tErrors("resourceNotFound") }, { status: 404 });
  }
  if (resource.uploadedByUserId !== ctx.userId) {
    return NextResponse.json({ error: tErrors("notAuthorizedForResource") }, { status: 403 });
  }

  try {
    await assertFacultyLinkedToStudent(ctx, resource.studentProfileId, resource.courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
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
