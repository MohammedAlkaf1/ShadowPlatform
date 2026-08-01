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
 *
 * Every access ATTEMPT is audit-logged, not just successful ones — a wrong
 * role or an unassigned specialist trying to open a student's document is
 * itself something a PDPL-conscious audit trail should record. The only
 * case that's not logged is a fully unauthenticated request, since
 * AuditLog.actorUserId is required and there is no known actor to attribute
 * it to.
 *
 * Judgment call: an unassigned specialist gets 403 (not 404) here. Phase 1
 * originally returned 404 for this to avoid confirming a document's
 * existence to a specialist outside their caseload. Phase 2's test suite
 * explicitly expects 403 for this exact case, and the caller is already an
 * authenticated staff member in the same tenant (not an anonymous actor),
 * so the residual information-disclosure risk of confirming "a document
 * exists but you can't open it" is minor. A genuinely nonexistent document
 * id still returns 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const auth = await requireMobileRole(request, "specialist", "admin");
  if (!auth.ok) {
    if (auth.ctx) {
      await logAudit({
        tenantId: auth.ctx.tenantId,
        actorUserId: auth.ctx.userId,
        action: "view_document_denied",
        resourceType: "Document",
        resourceId: documentId,
        ipAddress: getRequestIp(request),
      });
    }
    return auth.response;
  }
  const { ctx } = auth;
  const db = getTenantScopedPrisma(ctx.tenantId);

  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.deletedAt) {
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "view_document_denied",
      resourceType: "Document",
      resourceId: documentId,
      ipAddress: getRequestIp(request),
    });
    return NextResponse.json({ error: "المستند غير موجود" }, { status: 404 });
  }

  if (ctx.role !== "admin") {
    const assignment = await db.specialistAssignment.findFirst({
      where: { specialistUserId: ctx.userId, studentProfileId: document.studentProfileId },
    });
    if (!assignment) {
      await logAudit({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "view_document_denied",
        resourceType: "Document",
        resourceId: document.id,
        targetStudentProfileId: document.studentProfileId,
        ipAddress: getRequestIp(request),
      });
      return NextResponse.json({ error: "لا تملك صلاحية الوصول لهذا المستند" }, { status: 403 });
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
