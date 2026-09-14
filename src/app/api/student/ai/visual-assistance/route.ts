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
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`student-ai-visual:${ctx.userId}`, RATE_LIMIT);
  if (!rateLimit.allowed) {
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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const image = formData.get("image");
  const modeRaw = formData.get("mode");
  const languageRaw = formData.get("language");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (modeRaw !== "describe" && modeRaw !== "read_text") {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (languageRaw !== "ar" && languageRaw !== "en") {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  const mode: VisualAssistanceMode = modeRaw;
  const language: StudentAiLanguage = languageRaw;

  if (image.type !== "image/jpeg" && image.type !== "image/png") {
    return NextResponse.json({ error: tErrors("imageOnly") }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: tErrors("fileTooLarge") }, { status: 400 });
  }

  const imageBytes = Buffer.from(await image.arrayBuffer());
  if (!(await verifyFileContent(imageBytes, image.type))) {
    return NextResponse.json({ error: tErrors("imageOnly") }, { status: 400 });
  }

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "VISUAL_MODE");
  if (!aiContext) {
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }

  let result: string;
  try {
    result = await describeOrReadImage(
      imageBytes,
      image.type as "image/jpeg" | "image/png",
      mode,
      aiContext.directives,
      aiContext.categoryCode,
      language
    );
  } catch (err) {
    // Diagnostic-only: sanitized error name/message, never the image bytes,
    // prompt, or key. Message is truncated defensively in case a future
    // provider error ever embeds unexpectedly large content.
    console.error(
      `[student/ai/visual-assistance] Gemini request failed: ` +
        `${err instanceof Error ? err.constructor.name : typeof err}: ` +
        `${(err instanceof Error ? err.message : String(err)).slice(0, 500)}`
    );
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the image bytes or the model's response text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_visual_assistance_ai",
    resourceType: "StudentAiFeature",
  });

  return NextResponse.json({ result });
}
