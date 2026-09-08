import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { encryptBuffer, DOCUMENT_ENCRYPTION_KEY_REF } from "@/lib/encryption";
import { putEncryptedObject, buildDocumentObjectKey } from "@/lib/s3";
import { verifyFileContent } from "@/lib/file-validation";
import { logAudit } from "@/lib/audit";

const MAX_UPLOAD_SIZE_BYTES = Number(process.env.MAX_UPLOAD_SIZE_BYTES ?? 15_728_640);

/**
 * POST /api/documents/upload — student uploads a medical PDF from the
 * mobile app. Mirrors the web /student/upload flow exactly: validate
 * type/size -> AES-256-GCM encrypt server-side -> write to MinIO/S3 ->
 * Document row (metadata only, no binary in DB) -> audit log. No
 * client-side presigned URLs — everything goes through this API so nothing
 * skips the audit trail.
 */
export async function POST(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "الرجاء إرفاق ملف" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "يُسمح فقط برفع ملفات PDF" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json({ error: "حجم الملف يتجاوز الحد المسموح" }, { status: 400 });
  }

  const plaintext = Buffer.from(await file.arrayBuffer());
  if (!(await verifyFileContent(plaintext, file.type))) {
    return NextResponse.json({ error: "يُسمح فقط برفع ملفات PDF" }, { status: 400 });
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
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

  if (studentProfile.requestStatus === "pending") {
    await db.studentProfile.update({
      where: { id: studentProfile.id },
      data: { requestStatus: "under_review" },
    });
  }

  return NextResponse.json({ ok: true, documentId }, { status: 201 });
}
