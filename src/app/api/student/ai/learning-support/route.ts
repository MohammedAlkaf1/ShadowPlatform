import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { processLearningText } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

// Matches the Flutter app's own client-side truncation
// (process_document_with_gpt4o.dart extracted PDF text to 8000 chars
// before this migration) — enforced here server-side rather than trusted
// from the client.
const bodySchema = z.object({
  text: z.string().trim().min(1).max(8000),
  mode: z.enum(["summarize", "simplify", "quiz"]),
  language: z.enum(["ar", "en"]),
});

/**
 * Rate limit: 15 requests per 10-minute window per student. Each call is a
 * heavier Gemini text request (up to 8000 input chars, 800 output tokens)
 * than the other four student AI endpoints.
 */
const RATE_LIMIT = { limit: 15, windowMs: 10 * 60_000 };

/**
 * POST /api/student/ai/learning-support — JSON body { text, mode, language }.
 *
 * SECURITY MIGRATION: replaces the Flutter app's direct client-side Gemini
 * call (lib/custom_code/actions/process_document_with_gpt4o.dart). PDF text
 * extraction stays client-side (unchanged behavior — this endpoint never
 * parses a PDF itself, only the already-extracted text); only the Gemini
 * call itself moves server-side. See src/lib/ai.ts's top-of-file exception
 * comment.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`student-ai-learning:${ctx.userId}`, RATE_LIMIT);
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

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "LEARNING_MODE");
  if (!aiContext) {
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }

  let result: string;
  try {
    result = await processLearningText(
      parsed.data.text,
      parsed.data.mode,
      aiContext.directives,
      aiContext.categoryCode,
      parsed.data.language
    );
  } catch {
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the document text or the model's response text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_learning_support_ai",
    resourceType: "StudentAiFeature",
  });

  return NextResponse.json({ result });
}
