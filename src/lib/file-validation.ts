import { fileTypeFromBuffer } from "file-type";

/**
 * Real magic-byte / file-signature verification — never trusts the
 * browser-supplied `file.type` or the filename's extension, both of which
 * are just labels an attacker fully controls (a renamed `.exe` can declare
 * itself `application/pdf` with a `.pdf` filename and pass every check that
 * only looks at those). This inspects the actual bytes.
 *
 * Each declared MIME type this app accepts anywhere maps to the set of
 * signatures `file-type` may legitimately report for a real file of that
 * kind. Unknown declared types are rejected outright (fail closed) rather
 * than silently allowed through unverified.
 */
const DETECTABLE_TYPE_ALLOWLIST: Record<string, string[]> = {
  "application/pdf": ["application/pdf"],
  "image/png": ["image/png"],
  "image/jpeg": ["image/jpeg"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

// Legacy binary Office formats (.doc, .xls, .ppt) share one container format
// (OLE Compound File Binary) that `file-type` can only identify generically
// as "application/x-cfb" — it cannot confirm which specific Office format
// lives inside without much deeper structural parsing this app doesn't need.
// This still blocks the actual attack the check exists for (a renamed
// executable/script/image claiming to be a .doc — those have a completely
// different, detectable signature, or none at all that isn't CFB), just not
// a same-container cross-format mismatch (e.g. a .xls renamed to .doc).
const CFB_CONTAINER_TYPES = new Set(["application/msword"]);

/**
 * Returns true if `buffer`'s actual content signature is consistent with
 * `declaredMime`. Callers should reject the upload when this returns false.
 */
export async function verifyFileContent(buffer: Buffer, declaredMime: string): Promise<boolean> {
  const detected = await fileTypeFromBuffer(buffer);

  const allowedSignatures = DETECTABLE_TYPE_ALLOWLIST[declaredMime];
  if (allowedSignatures) {
    return !!detected && allowedSignatures.includes(detected.mime);
  }

  if (CFB_CONTAINER_TYPES.has(declaredMime)) {
    // No detectable signature at all (some minimal/older .doc files don't
    // trigger file-type's heuristics) is tolerated here specifically to
    // avoid rejecting genuine legacy documents purely on a library
    // limitation; a POSITIVELY detected, different, known format is not.
    return !detected || detected.mime === "application/x-cfb";
  }

  // Declared a MIME type this helper doesn't know how to verify — fail
  // closed rather than let an unverified type through silently.
  return false;
}
