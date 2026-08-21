import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * S3-compatible client, pointed at MinIO for local dev (see docker-compose.yml)
 * and at a real S3-compatible bucket in production via env vars.
 *
 * All document routes go through the Next.js API server — there are no
 * client-side presigned URLs — so every read/write can be audit-logged.
 */
export const s3Client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.S3_BUCKET ?? "shadow-documents";

/** Documents are stored per-tenant: {tenantId}/documents/{studentProfileId}/{uuid}.enc */
export function buildDocumentObjectKey(tenantId: string, studentProfileId: string, documentId: string): string {
  return `${tenantId}/documents/${studentProfileId}/${documentId}.enc`;
}

/**
 * Faculty resources live under a DISTINCT prefix from Document
 * (faculty-resources/ vs documents/) and keep their original file
 * extension (rather than Document's opaque `.enc` suffix) — a deliberate,
 * visible marker in the bucket that this object class is stored as
 * plaintext, never encrypted (explicit product decision — see
 * FacultyResource in prisma/schema.prisma). Never mix the two prefixes.
 */
export function buildFacultyResourceObjectKey(
  tenantId: string,
  studentProfileId: string,
  resourceId: string,
  originalFilename: string
): string {
  const ext = originalFilename.includes(".") ? originalFilename.slice(originalFilename.lastIndexOf(".")) : "";
  return `${tenantId}/faculty-resources/${studentProfileId}/${resourceId}${ext}`;
}

/**
 * Voice-confirmation audio for an exam Answer (voice-driven exam-taking,
 * Phase 1) — a student's spoken confirmation of their chosen MCQ option,
 * not a medical document, so it follows FacultyResource's PLAINTEXT
 * pattern (see putPlainObject/getPlainObject below), not Document's
 * encrypted pair (judgment call — see docs/API.md and the feature's
 * report: this carries no more sensitivity than the Answer row itself,
 * which is already plaintext in the DB). Own prefix, distinct from both
 * documents/ and faculty-resources/, so the bucket layout keeps signaling
 * storage class by path at a glance.
 */
export function buildExamAnswerAudioObjectKey(
  tenantId: string,
  examSubmissionId: string,
  answerId: string,
  originalFilename: string
): string {
  const ext = originalFilename.includes(".") ? originalFilename.slice(originalFilename.lastIndexOf(".")) : "";
  return `${tenantId}/exam-answers/${examSubmissionId}/${answerId}${ext}`;
}

export async function putEncryptedObject(objectKey: string, body: Buffer): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: "application/octet-stream",
    })
  );
}

export async function getEncryptedObject(objectKey: string): Promise<Buffer> {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    })
  );
  const byteArray = await result.Body?.transformToByteArray();
  if (!byteArray) {
    throw new Error(`Object ${objectKey} has no body`);
  }
  return Buffer.from(byteArray);
}

/**
 * Plaintext put/get — used ONLY by FacultyResource. Never call these for
 * Document (medical) uploads; those must always go through
 * putEncryptedObject/getEncryptedObject in src/lib/encryption.ts +
 * src/lib/s3.ts's encrypted pair above.
 */
export async function putPlainObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getPlainObject(objectKey: string): Promise<Buffer> {
  const result = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    })
  );
  const byteArray = await result.Body?.transformToByteArray();
  if (!byteArray) {
    throw new Error(`Object ${objectKey} has no body`);
  }
  return Buffer.from(byteArray);
}

export async function deleteObject(objectKey: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    })
  );
}
