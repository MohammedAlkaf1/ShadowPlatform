import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyFileContent } from "@/lib/file-validation";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { describeOrReadImage, type VisualAssistanceMode, type StudentAiLanguage } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

// Camera/gallery JPEG photos this feature actually receives are typically
// well under 5MB; 8MB gives headroom without accepting an unreasonably
// large upload for a single-image vision call.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Rate limit: 20 requests per 5-minute window per student. Visual
 * Assistance is used somewhat frequently by low-vision students (repeated
 * scene checks), but each call is a real Gemini vision request — this caps
 * worst-case per-student spend while comfortably covering normal use.
 */
const RATE_LIMIT = { limit: 20, windowMs: 5 * 60_000 };

/**
 * POST /api/student/ai/visual-assistance — multipart/form-data.
 *
 * Fields: image (JPEG/PNG file), mode ("describe" | "read_text"),
 * language ("ar" | "en").
 *
 * SECURITY MIGRATION: replaces the Flutter app's direct client-side Gemini
 * call (lib/custom_code/actions/analyze_image_with_gpt4o.dart), which
 * required embedding GEMINI_API_KEY in the release APK. See src/lib/ai.ts's
 * top-of-file exception comment. The prompt is built entirely server-side
 * from the student's own DB-verified support plan — the client supplies
 * only the image bytes, the requested mode, and its own UI language.
 */
// TEMPORARY diagnostic helper — see the top-of-function comment for why this
// route needs stage-by-stage logging beyond the single catch-block line that
// turned out to be insufficient (that line never appeared in Hostinger's
// logs even after confirming stdout is visible there, which means we don't
// yet know whether the catch block is even being reached). Logs ONLY safe
// metadata: stage name, booleans, HTTP-status-shaped numbers, MIME type,
// byte length, error constructor name, and a truncated error message. Never
// logs the Authorization header, JWT, image bytes/base64, full request
// body, student PII, or the Gemini response content itself.
function debugLog(stage: string, fields?: Record<string, string | number | boolean>) {
  const safe = fields ? " " + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ") : "";
  console.log(`[visual-debug] ${stage}${safe}`);
}

/**
 * POST /api/student/ai/visual-assistance — multipart/form-data.
 *
 * Fields: image (JPEG/PNG file), mode ("describe" | "read_text"),
 * language ("ar" | "en").
 *
 * SECURITY MIGRATION: replaces the Flutter app's direct client-side Gemini
 * call (lib/custom_code/actions/analyze_image_with_gpt4o.dart), which
 * required embedding GEMINI_API_KEY in the release APK. See src/lib/ai.ts's
 * top-of-file exception comment. The prompt is built entirely server-side
 * from the student's own DB-verified support plan — the client supplies
 * only the image bytes, the requested mode, and its own UI language.
 *
 * TEMPORARY: every stage below logs via debugLog() so a production
 * reproduction can show exactly how far the request got before failing —
 * remove once Visual Assistance is confirmed stable in production.
 */
export async function POST(request: Request) {
  debugLog("route_entered");
  const tErrors = await getTranslations("Common.errors");

  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) {
    debugLog("FAILED", { stage: "auth", status: auth.response.status });
    return auth.response;
  }
  const { ctx } = auth;
  debugLog("auth_ok");

  const rateLimit = checkRateLimit(`student-ai-visual:${ctx.userId}`, RATE_LIMIT);
  if (!rateLimit.allowed) {
    debugLog("FAILED", { stage: "rate_limit" });
    return NextResponse.json(
      { error: tErrors("tooManyRequests") },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }
  debugLog("rate_limit_ok");

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    debugLog("FAILED", { stage: "form_data_parse" });
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  debugLog("form_data_parsed");

  const image = formData.get("image");
  const modeRaw = formData.get("mode");
  const languageRaw = formData.get("language");

  if (!(image instanceof File)) {
    debugLog("FAILED", { stage: "image_field_missing" });
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (modeRaw !== "describe" && modeRaw !== "read_text") {
    debugLog("FAILED", { stage: "mode_invalid", modeRaw: String(modeRaw) });
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (languageRaw !== "ar" && languageRaw !== "en") {
    debugLog("FAILED", { stage: "language_invalid", languageRaw: String(languageRaw) });
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  const mode: VisualAssistanceMode = modeRaw;
  const language: StudentAiLanguage = languageRaw;
  debugLog("image_received", { mime: image.type, bytes: image.size, mode, language });

  if (image.type !== "image/jpeg" && image.type !== "image/png") {
    debugLog("FAILED", { stage: "mime_rejected", mime: image.type });
    return NextResponse.json({ error: tErrors("imageOnly") }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    debugLog("FAILED", { stage: "size_rejected", bytes: image.size, maxBytes: MAX_IMAGE_BYTES });
    return NextResponse.json({ error: tErrors("fileTooLarge") }, { status: 400 });
  }

  const imageBytes = Buffer.from(await image.arrayBuffer());
  debugLog("bytes_read", { bytes: imageBytes.length });

  const contentValid = await verifyFileContent(imageBytes, image.type);
  if (!contentValid) {
    debugLog("FAILED", { stage: "magic_byte_validation", declaredMime: image.type });
    return NextResponse.json({ error: tErrors("imageOnly") }, { status: 400 });
  }
  debugLog("magic_byte_validation_ok");

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "VISUAL_MODE");
  if (!aiContext) {
    debugLog("FAILED", { stage: "support_plan_authorization" });
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }
  debugLog("feature_authorized", { categoryCode: aiContext.categoryCode });

  let result: string;
  try {
    debugLog("gemini_request_start", { mime: image.type, bytes: imageBytes.length, mode, language });
    result = await describeOrReadImage(
      imageBytes,
      image.type as "image/jpeg" | "image/png",
      mode,
      aiContext.directives,
      aiContext.categoryCode,
      language
    );
    debugLog("gemini_response_ok", { resultLength: result.length });
  } catch (err) {
    // Diagnostic-only: sanitized error name/message, never the image bytes,
    // prompt, or key. Message is truncated defensively in case a future
    // provider error ever embeds unexpectedly large content.
    debugLog("FAILED", {
      stage: "gemini",
      errorType: err instanceof Error ? err.constructor.name : typeof err,
      message: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    });
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the image bytes or the model's response text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_visual_assistance_ai",
    resourceType: "StudentAiFeature",
  });

  debugLog("route_success");
  return NextResponse.json({ result });
}
