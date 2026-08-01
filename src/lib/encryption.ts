import crypto from "crypto";

/**
 * AES-256-GCM encryption for document contents at rest.
 *
 * DOCUMENT_ENCRYPTION_KEY (a 32-byte / 64-hex-char secret) stands in for a
 * real KMS-managed key in local/dev environments. In production this should
 * be replaced by a call to a real KMS (e.g. AWS KMS) that returns a
 * per-object data key; the `encryptionKeyRef` column on Document already
 * anticipates that (it currently stores a static ref, but is designed to
 * later hold a KMS key id / version instead).
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended IV length for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars)");
  }
  return key;
}

/**
 * Encrypts a buffer and returns a single buffer laid out as:
 * [ iv (12 bytes) | authTag (16 bytes) | ciphertext ]
 * so the object stored in S3/MinIO is self-describing and needs no
 * side-channel metadata to decrypt (beyond the key itself).
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  const key = getKey();
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Static reference stored on Document.encryptionKeyRef for the local KMS stand-in. */
export const DOCUMENT_ENCRYPTION_KEY_REF = "local-env-key-v1";
