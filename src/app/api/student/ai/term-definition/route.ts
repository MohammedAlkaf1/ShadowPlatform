import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { defineTermSimple } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

// A tapped term/phrase from a live transcript — short by nature.
const bodySchema = z.object({
  term: z.string().trim().min(1).max(100),
  language: z.enum(["ar", "en"]),
});

/**
 * Rate limit: 30 requests per 5-minute window per student. Lightweight,
 * quick single-sentence lookups (deaf-mode intensive support, tapping
 * difficult terms) — the cheapest of the five migrated calls.
 */
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60_000 };

/**
 * POST /api/student/ai/term-definition — JSON body { term, language }.
 *
 * SECURITY MIGRATION: replaces the Flutter app's direct client-side Gemini
 * call (deaf_mode_transcription_widget.dart's _TermDefinitionSheet). See
 * src/lib/ai.ts's top-of-file exception comment.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`student-ai-term:${ctx.userId}`, RATE_LIMIT);
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

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "DEAF_MODE");
  if (!aiContext) {
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }

  let result: string;
  try {
    result = await defineTermSimple(parsed.data.term, parsed.data.language);
  } catch {
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the term text or the model's response text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_deaf_mode_assist_ai",
    resourceType: "StudentAiFeature",
    resourceId: "term_definition",
  });

  return NextResponse.json({ result });
}
