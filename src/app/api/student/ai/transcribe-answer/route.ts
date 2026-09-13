import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyFileContent } from "@/lib/file-validation";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { transcribePrerecordedWav, type DeepgramLanguage } from "@/lib/deepgram";
import { logAudit } from "@/lib/audit";

// A Voice Exam capture is a single spoken utterance (an MCQ option, or a
// yes/"إعادة" confirmation reply), hard-capped client-side at 3-8 seconds
// (StudentProfile.physicalModeListeningDurationSeconds) or a fixed 8s for
// the confirmation step. At 16-bit mono 16kHz PCM that's at most ~256KB of
// audio; 2MB gives generous headroom above that without accepting an
// unreasonably large upload for what is, by design, a short clip.
const MAX_AUDIO_BYTES = Number(process.env.MAX_VOICE_EXAM_AUDIO_SIZE_BYTES ?? 2_097_152);

/**
 * Rate limit: 40 requests per 10-minute window per student. A single exam
 * question can trigger multiple captures (an initial answer attempt, one or
 * more retries on a "didn't understand" no-match, then the confirmation
 * step) across up to ~10 questions per exam — 40/10min comfortably covers a
 * full exam attempt's worth of retries while still bounding worst-case
 * per-student Deepgram spend if a client malfunctions or loops.
 */
const RATE_LIMIT = { limit: 40, windowMs: 10 * 60_000 };

/**
 * POST /api/student/ai/transcribe-answer — multipart/form-data.
 *
 * Fields: audio (WAV file, PCM16 mono 16kHz), language ("ar" | "en-US" —
 * the exact two values the Flutter app already sends today via
 * AppPrefs.deepgramLanguageCode, confirmed by inspection, not guessed).
 *
 * SECURITY MIGRATION: replaces the Flutter Voice Exam feature's direct
 * client-side Deepgram WebSocket call (lib/custom_code/actions/
 * listen_for_exam_answer.dart in the Flutter repo), which required
 * embedding DEEPGRAM_API_KEY in the release APK. A read-only audit of that
 * feature confirmed its UI never shows interim/partial transcript text
 * during a capture — only the final transcript, once the whole short
 * utterance has been recorded — so this one-shot REST proxy is behavior-
 * equivalent, not a functional downgrade. See src/lib/deepgram.ts's
 * top-of-file comment for why deaf-mode's true real-time transcription is
 * explicitly OUT of scope here (different feature, different requirements).
 *
 * Gated the same way as the other student AI endpoints (visual-assistance,
 * learning-support): requires the student's own approved SupportPlan to
 * have PHYSICAL_MODE enabled, independently re-verified server-side rather
 * than trusted from the client, since this now costs the platform real
 * Deepgram spend per call — not merely course-enrollment-gated like the
 * plain exam-answer-submission route (POST /api/exams/:id/answers), because
 * this is specifically the accessibility feature, not exam access itself.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`student-ai-voice-exam-transcribe:${ctx.userId}`, RATE_LIMIT);
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

  const audio = formData.get("audio");
  const languageRaw = formData.get("language");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (languageRaw !== "ar" && languageRaw !== "en-US") {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  const language: DeepgramLanguage = languageRaw;

  // Never trust only the declared MIME type — some browsers/clients send
  // "audio/x-wav", "audio/wave", or an empty string for a real WAV file, but
  // accepting those without also checking real content would widen the
  // door; require the exact declared type AND a verified matching
  // signature, same fail-closed posture as every other upload in this app.
  if (audio.type !== "audio/wav") {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: tErrors("audioFileTooLarge") }, { status: 400 });
  }

  const audioBytes = Buffer.from(await audio.arrayBuffer());
  if (!(await verifyFileContent(audioBytes, audio.type))) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "PHYSICAL_MODE");
  if (!aiContext) {
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }

  // audioBytes is processed in-memory only and discarded once this request
  // completes — never written to disk, S3/MinIO, or the database. Matches
  // this feature's existing behavior (the live-WS version never persisted
  // audio server-side either) and this project's "no new permanent audio
  // storage" constraint for this migration.
  const result = await transcribePrerecordedWav(audioBytes, language);
  if (result.error) {
    // Sanitized server-side log only — never the audio, never the
    // transcript, never the raw Deepgram error detail (see deepgram.ts).
    console.error(`[transcribe-answer] Deepgram request failed: ${result.error}`);
  }
  if (!result.transcript) {
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  // Metadata only — never the audio bytes or the transcript text.
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_voice_exam_transcription_ai",
    resourceType: "StudentAiFeature",
    resourceId: "voice_exam_transcription",
  });

  return NextResponse.json({ transcript: result.transcript });
}
