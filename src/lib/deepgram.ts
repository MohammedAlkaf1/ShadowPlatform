/**
 * Server-side Deepgram client — prerecorded (non-streaming) REST
 * transcription only.
 *
 * SECURITY MIGRATION: replaces the Flutter Voice Exam feature's direct
 * client-side Deepgram WebSocket call (lib/custom_code/actions/
 * listen_for_exam_answer.dart), which required embedding DEEPGRAM_API_KEY
 * in the release APK — the same class of exposure the Gemini key had (see
 * src/lib/ai.ts's top-of-file comment). A read-only audit of the Flutter
 * app confirmed the Voice Exam UI never shows interim/partial transcript
 * text during a capture — it only uses the transcript once the whole
 * utterance (3–8 seconds, support-level dependent) has been recorded — so
 * there is no real-time requirement here at all: the existing live-WS
 * capture can be replaced by "record the same PCM16/WAV clip the app
 * already builds locally, POST it once, get back one final transcript."
 *
 * Deliberately a SEPARATE file from ai.ts: this project's one-file-per-
 * external-provider convention (ai.ts owns every Gemini call) extends
 * naturally to Deepgram getting its own file, and it keeps this narrowly-
 * scoped addition isolated from ai.ts's much larger, actively-evolving
 * Gemini surface area.
 *
 * This is intentionally NOT a general-purpose Deepgram client — it exposes
 * exactly one function, with a fixed model/feature set, matching this
 * project's "no arbitrary provider config from the client" rule. Deaf-mode
 * live transcription (which DOES need true real-time interim results) is
 * explicitly out of scope for this file — see the Voice-Exam-only proxy
 * task this was built for.
 */

const DEEPGRAM_MODEL = "nova-3";

/** Exact language codes the Flutter app already sends today (AppPrefs.deepgramLanguageCode) — not guessed. */
export type DeepgramLanguage = "ar" | "en-US";

// Deepgram's own documented timeout guidance for prerecorded requests is
// generous, but this is a short (3-8s) spoken-utterance clip, not a long
// lecture recording — 10s is ample headroom above realistic processing time
// while still bounding worst-case hang time for a single exam-answer
// interaction the student is actively waiting on.
const UPSTREAM_TIMEOUT_MS = 10_000;

export interface TranscribeResult {
  transcript: string | null;
  /** Non-null only on failure — never Deepgram's raw response body (may include request-identifying detail); see route.ts, which logs a sanitized version and never forwards this to the client. */
  error: string | null;
}

/**
 * Transcribes a single short WAV clip via Deepgram's prerecorded REST API
 * (`POST https://api.deepgram.com/v1/listen`) — plain HTTPS, no WebSocket.
 * `wavBytes` must already be a valid WAV (RIFF) container; the caller
 * (route.ts) is responsible for validating that before this is called.
 *
 * Configuration mirrors the Flutter app's existing live-WS request as
 * closely as a one-shot REST call allows: same model (nova-3), same
 * smart_format, same PCM16/mono/16kHz expectation (declared via query
 * params for Deepgram's own validation — the WAV container's own header
 * already carries the real format). No `interim_results` (this endpoint
 * only ever returns a single final transcript) and no `keyterm` list (the
 * Voice Exam feature never used keyterm boosting — that's specific to
 * deaf-mode's course-linked lecture vocabulary, unrelated to matching a
 * short spoken MCQ answer against a fixed, already-known set of options).
 */
export async function transcribePrerecordedWav(
  wavBytes: Buffer,
  language: DeepgramLanguage
): Promise<TranscribeResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return { transcript: null, error: "DEEPGRAM_API_KEY is not set" };
  }

  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", DEEPGRAM_MODEL);
  url.searchParams.set("language", language);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("encoding", "linear16");
  url.searchParams.set("sample_rate", "16000");
  url.searchParams.set("channels", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        // Deepgram's documented auth scheme — never logged, never echoed
        // back to the client in any response or error path.
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: new Uint8Array(wavBytes),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      transcript: null,
      error: timedOut ? "Deepgram request timed out" : "Deepgram request failed",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // Deliberately not forwarding response.text() to the caller — a
    // Deepgram error body could echo back request details; the caller only
    // gets a status-coded generic failure, matching ai.ts's chatCompletion
    // convention of swallowing raw provider error detail.
    return { transcript: null, error: `Deepgram returned HTTP ${response.status}` };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { transcript: null, error: "Deepgram returned invalid JSON" };
  }

  const transcript = extractTranscript(data);
  if (transcript === null) {
    return { transcript: null, error: "Deepgram returned no transcript" };
  }
  return { transcript, error: null };
}

/** Pulls `results.channels[0].alternatives[0].transcript` out of Deepgram's prerecorded response shape, defensively. */
function extractTranscript(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const results = (data as Record<string, unknown>).results;
  if (!results || typeof results !== "object") return null;
  const channels = (results as Record<string, unknown>).channels;
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const alternatives = (channels[0] as Record<string, unknown>)?.alternatives;
  if (!Array.isArray(alternatives) || alternatives.length === 0) return null;
  const transcript = (alternatives[0] as Record<string, unknown>)?.transcript;
  return typeof transcript === "string" ? transcript : null;
}
