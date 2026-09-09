import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { getEncryptedObject } from "@/lib/s3";
import { decryptBuffer } from "@/lib/encryption";
import { logAudit, getRequestIp } from "@/lib/audit";
import { localize } from "@/lib/localize";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/locale";

/**
 * GET /api/documents/:id — specialist/admin download, or a student opening
 * their own document.
 *
 * Serves BOTH the mobile app (Bearer JWT) and the web app (NextAuth
 * session cookie) via requireApiRole, which tries a mobile JWT first and
 * falls back to a web session — see src/lib/api-auth.ts. Originally this
 * only supported the JWT path, which meant a specialist using the actual
 * web UI could never open a document at all (always 401) — discovered
 * while adding document visibility to /specialist/students/[id] (commit
 * b86fe52). Every check below (role, tenant scoping via
 * getTenantScopedPrisma, the SpecialistAssignment check, audit logging)
 * runs identically regardless of which auth path produced ctx — there is
 * no separate/weaker code path for the web session.
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
  const tErrors = await getTranslations("Common.errors");
  const { id: documentId } = await params;
  const auth = await requireApiRole(request, "specialist", "admin", "student");
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
    return NextResponse.json({ error: tErrors("documentNotFound") }, { status: 404 });
  }

  if (ctx.role === "student") {
    const ownProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
    if (!ownProfile || ownProfile.id !== document.studentProfileId) {
      await logAudit({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: "view_document_denied",
        resourceType: "Document",
        resourceId: document.id,
        targetStudentProfileId: document.studentProfileId,
        ipAddress: getRequestIp(request),
      });
      return NextResponse.json({ error: tErrors("notAuthorizedForDocument") }, { status: 403 });
    }
  } else if (ctx.role !== "admin") {
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
      return NextResponse.json({ error: tErrors("notAuthorizedForDocument") }, { status: 403 });
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

  // Opening your own document isn't a specialist review — only flip
  // pending → reviewed when a specialist/admin is the one opening it.
  if (document.status === "pending" && ctx.role !== "student") {
    await db.document.update({ where: { id: document.id }, data: { status: "reviewed" } });
  }

  // Reads the authenticated user's saved locale directly rather than going
  // through resolveLocale() (src/i18n/request.ts) — that helper also checks
  // the NEXT_LOCALE cookie/Accept-Language for the pre-login case, neither
  // of which apply here (this route requires auth), and pulling it in drags
  // along a next-intl plugin-only module that next/headers's cookies()
  // needs a real Next.js request scope for — this stays a plain query
  // through the same tenant-scoped `db` client already used above.
  const requestingUser = await db.user.findUnique({ where: { id: ctx.userId }, select: { locale: true } });
  const locale = isSupportedLocale(requestingUser?.locale) ? requestingUser.locale : DEFAULT_LOCALE;
  const downloadFilename = localize(document.originalFilename, document.originalFilenameEn, locale);

  return new NextResponse(new Uint8Array(plaintext), {
    status: 200,
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(downloadFilename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
