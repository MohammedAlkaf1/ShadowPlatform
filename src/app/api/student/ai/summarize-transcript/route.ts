import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { summarizeTranscriptChunk } from "@/lib/ai";
import { autoSummarySentenceCount } from "@/lib/student-ai-labels";
import { logAudit } from "@/lib/audit";

// Matches the Flutter app's own client-side truncation
// (auto_summary_service.dart takes the last 800 chars of the rolling
// transcript before this migration) — enforced here server-side.
const bodySchema = z.object({
  transcriptExcerpt: z.string().trim().min(1).max(800),
});

/**
 * Rate limit: 20 requests per 10-minute window per student. The original
 * client polls every 30s but only actually fires a summary on a 2-5 minute
 * cadence (support-level dependent) plus an on-demand "لخّص لي الآن" button
 * — 20/10min comfortably covers both without allowing a malfunctioning/
 * looping client to run up Gemini spend.
 */
const RATE_LIMIT = { limit: 20, windowMs: 10 * 60_000 };

/**
 * POST /api/student/ai/summarize-transcript — JSON body { transcriptExcerpt }.
 *
 * SECURITY MIGRATION: replaces the Flutter app's direct client-side Gemini
 * call (services/auto_summary_service.dart's triggerNow). See
 * src/lib/ai.ts's top-of-file exception comment. Sentence count (2 or 3) is
 * derived server-side from the student's own approved support level, never
 * trusted from the client.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`student-ai-summary:${ctx.userId}`, RATE_LIMIT);
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

  const sentenceCount = autoSummarySentenceCount(aiContext.supportLevelOrder);

  let result: string;
  try {
    result = await summarizeTranscriptChunk(parsed.data.transcriptExcerpt, sentenceCount);
  } catch {
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the transcript text or the model's response text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_deaf_mode_assist_ai",
    resourceType: "StudentAiFeature",
    resourceId: "transcript_summary",
  });

  return NextResponse.json({ result });
}
