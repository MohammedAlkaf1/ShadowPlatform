import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/**
 * Extracts a SAFE extension (dot + up to 10 alnum chars) from a
 * client-supplied filename, for use as a suffix in a server-built S3 object
 * key. `originalFilename` is fully attacker-controlled (the browser sends
 * whatever `file.name` it wants), so naively slicing everything after the
 * last "." — e.g. "evil.txt/../../../etc/passwd" — would smuggle "/" and
 * ".." into the object key. Some S3-compatible backends (this project's own
 * local MinIO included) store objects as real files on disk keyed by path,
 * where an unsanitized "../" segment can escape the intended prefix. Real
 * AWS S3 doesn't resolve "..", but this must be safe for every backend the
 * app can be deployed against, not just the one used in production.
 */
function safeExtension(originalFilename: string): string {
  const match = /\.([a-zA-Z0-9]{1,10})$/.exec(originalFilename);
  return match ? `.${match[1]}` : "";
}

/**
 * S3-compatible client, pointed at MinIO for local dev (see docker-compose.yml)
 * and at a real S3-compatible bucket in production via env vars.
 *
 * All document routes go through the Next.js API server — there are no
 * client-side presigned URLs — so every read/write can be audit-logged.
 *
 * requestHandler timeouts are explicit and deliberate: the AWS SDK v3
 * applies NO default connection/request timeout, so a slow or unresponsive
 * storage endpoint would otherwise hang a request indefinitely (observed in
 * production as an upload that never completes) instead of failing fast
 * with a diagnosable error. Values are generous enough for a real upload
 * (up to the app's own ~20MB size limits) over a normal connection, while
 * still bounding the worst case to seconds, not minutes.
 */
export const s3Client = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  requestHandler: {
    connectionTimeout: 5_000,
    requestTimeout: 30_000,
  },
});

/**
 * Thrown by every function below when the underlying S3-compatible call
 * fails for any reason (timeout, connection refused, credentials, etc.) —
 * callers catch this specific type to return a clear, user-facing error
 * instead of letting an unhandled storage exception surface as a generic
 * 500/hang.
 */
export class StorageError extends Error {
  constructor(cause: unknown) {
    super("Storage operation failed");
    this.name = "StorageError";
    this.cause = cause;
    // Never shown to the end user (they only ever see the generic
    // "storageUnavailable" message) — this is the one place the actual
    // underlying reason (wrong endpoint/credentials/bucket, network
    // failure, etc.) gets recorded server-side for diagnosis.
    console.error("[s3] storage operation failed:", cause);
  }
}

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
  return `${tenantId}/faculty-resources/${studentProfileId}/${resourceId}${safeExtension(originalFilename)}`;
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
  return `${tenantId}/exam-answers/${examSubmissionId}/${answerId}${safeExtension(originalFilename)}`;
}

export async function putEncryptedObject(objectKey: string, body: Buffer): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: "application/octet-stream",
      })
    );
  } catch (err) {
    throw new StorageError(err);
  }
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
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      })
    );
  } catch (err) {
    throw new StorageError(err);
  }
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
