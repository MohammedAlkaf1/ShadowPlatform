"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";

export interface DocumentActionResult {
  ok: boolean;
  error?: string;
}

/** Marks a document as reviewed once its specialist has classified it from the standalone review screen. */
export async function markDocumentReviewed(documentId: string, studentProfileId: string): Promise<DocumentActionResult> {
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);
  const tErrors = await getTranslations("Common.errors");

  const db = getTenantScopedPrisma(ctx.tenantId);
  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.studentProfileId !== studentProfileId) {
    return { ok: false, error: tErrors("documentNotFound") };
  }

  await db.document.update({ where: { id: documentId }, data: { status: "reviewed" } });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "review_document",
    resourceType: "Document",
    resourceId: documentId,
    targetStudentProfileId: studentProfileId,
  });

  revalidatePath(`/specialist/documents`);
  revalidatePath(`/specialist/documents/${documentId}`);
  revalidatePath(`/specialist/queue`);
  return { ok: true };
}
