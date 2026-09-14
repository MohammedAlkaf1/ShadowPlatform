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
  // Voice Exam's short spoken-answer clips (PCM16 mono 16kHz, wrapped in a
  // WAV/RIFF container client-side) — see POST /api/student/ai/transcribe-answer.
  // `file-type`@22 reports a real WAV buffer's signature as exactly
  // "audio/wav" (verified directly against this project's pinned version,
  // not assumed from docs).
  "audio/wav": ["audio/wav"],
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

/**
 * Detects the REAL image type from `buffer`'s actual magic-byte signature,
 * ignoring any client-declared Content-Type entirely. Returns "image/jpeg"
 * or "image/png" only if the real bytes genuinely match one of those two
 * signatures — null for anything else (still fail-closed; no format outside
 * this allowlist is ever accepted).
 *
 * WHY THIS EXISTS SEPARATELY FROM verifyFileContent: that function checks
 * "do the real bytes match the CLIENT'S DECLARED type" — correct for a
 * browser `<input type=file>`, where the declared type is the browser's own
 * best read of the file. It is the wrong check for a client whose declared
 * Content-Type is not actually derived from the file's real bytes. This was
 * exactly the Visual Assistance production bug: the Flutter app's multipart
 * client (platform_client.dart's analyzeImage) builds the upload via
 * `http.MultipartFile.fromBytes('image', imageBytes, filename: 'photo.jpg')`
 * with no explicit `contentType` — the `http` package infers
 * `Content-Type: image/jpeg` purely from the hardcoded ".jpg" filename,
 * regardless of what format the real captured/compressed image bytes
 * actually are (image_picker's Android compression path does not guarantee
 * JPEG output for every source/quality combination). Any real photo whose
 * actual bytes weren't genuinely JPEG was being rejected with "Only JPEG or
 * PNG images are allowed" before ever reaching Gemini, because the
 * declared-type-based check compared real bytes against a label that was
 * never trustworthy for this specific client in the first place.
 *
 * Using the DETECTED type as authoritative (still restricted to this exact
 * two-value allowlist) fixes that while staying exactly as strict as
 * before: only a genuine JPEG or PNG is ever accepted, verified from the
 * real bytes, same as every other upload in this app.
 */
export async function detectImageType(buffer: Buffer): Promise<"image/jpeg" | "image/png" | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime === "image/jpeg") return "image/jpeg";
  if (detected?.mime === "image/png") return "image/png";
  return null;
}
