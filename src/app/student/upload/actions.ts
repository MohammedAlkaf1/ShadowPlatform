"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { encryptBuffer, DOCUMENT_ENCRYPTION_KEY_REF } from "@/lib/encryption";
import { putEncryptedObject, buildDocumentObjectKey } from "@/lib/s3";
import { verifyFileContent } from "@/lib/file-validation";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "crypto";
import { MAX_UPLOAD_SIZE_BYTES } from "./constants";

// Moved verbatim from the old src/app/student/documents/actions.ts (batch 3
// restructuring — the inline upload flow became this dedicated page). Same
// validation, same encryption/storage calls, same audit action name — only
// the revalidatePath targets changed to match the new unified dashboard
// route (/student/status now shows the file list that /student/documents
// used to own).
//
// MAX_UPLOAD_SIZE_BYTES lives in ./constants (not here) because a "use
// server" file may only export async functions — a plain exported const
// breaks Next's server-action validation.

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export interface UploadResult {
  ok: boolean;
  error?: string;
}

export async function uploadDocument(formData: FormData): Promise<UploadResult> {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const tErrors = await getTranslations("Common.errors");

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: tErrors("selectFile") };
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: tErrors("pdfOrWordOnly") };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, error: tErrors("fileTooLarge") };
  }

  const arrayBuffer = await file.arrayBuffer();
  const plaintext = Buffer.from(arrayBuffer);
  if (!(await verifyFileContent(plaintext, file.type))) {
    return { ok: false, error: tErrors("pdfOrWordOnly") };
  }

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });
  if (!studentProfile) {
    return { ok: false, error: tErrors("studentProfileNotFound") };
  }

  const ciphertext = encryptBuffer(plaintext);

  const documentId = randomUUID();
  const objectKey = buildDocumentObjectKey(ctx.tenantId, studentProfile.id, documentId);

  await putEncryptedObject(objectKey, ciphertext);

  await db.document.create({
    data: {
      id: documentId,
      tenantId: ctx.tenantId,
      studentProfileId: studentProfile.id,
      uploadedByUserId: ctx.userId,
      objectKey,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      encryptionKeyRef: DOCUMENT_ENCRYPTION_KEY_REF,
      status: "pending",
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "upload_document",
    resourceType: "Document",
    resourceId: documentId,
    targetStudentProfileId: studentProfile.id,
  });

  // Move the request into review once the student has at least one document.
  if (studentProfile.requestStatus === "pending") {
    await db.studentProfile.update({
      where: { id: studentProfile.id },
      data: { requestStatus: "under_review" },
    });
  }

  revalidatePath("/student/upload");
  revalidatePath("/student/status");

  return { ok: true };
}
