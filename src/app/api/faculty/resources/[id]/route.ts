import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertFacultyLinkedToStudent, FacultyAccessError } from "@/lib/faculty-access";
import { deleteObject } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/faculty/resources/:id — soft-deletes the DB row (audit trail)
 * and hard-deletes the underlying object from storage (no reason to keep
 * unencrypted bytes around once removed). Only the faculty member who
 * uploaded it may delete it, and only while they're still linked to that
 * student/course.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: tErrors("notAuthorizedToDeleteResource") }, { status: 403 });
  }

  try {
    await assertFacultyLinkedToStudent(ctx, resource.studentProfileId, resource.courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  await db.facultyResource.update({ where: { id }, data: { deletedAt: new Date() } });
  await deleteObject(resource.objectKey).catch(() => undefined);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "delete_faculty_resource",
    resourceType: "FacultyResource",
    resourceId: id,
    targetStudentProfileId: resource.studentProfileId,
  });

  return NextResponse.json({ ok: true });
}
