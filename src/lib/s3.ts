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

export async function deleteObject(objectKey: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    })
  );
}
