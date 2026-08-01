import { NextResponse } from "next/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { getEncryptedObject } from "@/lib/s3";
import { decryptBuffer } from "@/lib/encryption";
import { logAudit, getRequestIp } from "@/lib/audit";

/**
 * GET /api/documents/:id — specialist-only download.
 *
 * Access requires: role=specialist (or admin), same tenant, AND the document
 * belongs to a student that admin has manually assigned to this specialist
 * (SpecialistAssignment). Streams the decrypted bytes directly in the
 * response — the decrypted copy is never written to disk or cached — and
 * writes a view_document audit row before returning the file.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const auth = await requireMobileRole(request, "specialist", "admin");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.deletedAt) {
    return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
  }

  if (ctx.role !== "admin") {
    const assignment = await db.specialistAssignment.findFirst({
      where: { specialistUserId: ctx.userId, studentProfileId: document.studentProfileId },
    });
    if (!assignment) {
      return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
    }
  }

  const ciphertext = await getEncryptedObject(document.objectKey);
  const plaintext = decryptBuffer(ciphertext);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_document",
    resourceType: "Document",
    resourceId: document.id,
    targetStudentProfileId: document.studentProfileId,
    ipAddress: getRequestIp(request),
  });

  if (document.status === "pending") {
    await db.document.update({ where: { id: document.id }, data: { status: "reviewed" } });
  }

  return new NextResponse(new Uint8Array(plaintext), {
    status: 200,
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalFilename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
