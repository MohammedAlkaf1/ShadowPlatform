import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { synthesizeSpeech } from "@/lib/ai";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

/**
 * Rate limit: 30 requests per 60-second window per authenticated student.
 *
 * Voice-driven exam-taking reads exam question/option text aloud on
 * request — a student working through an exam might trigger this several
 * times per question (replay question, replay each option, replay after a
 * misheard word), so this needs more headroom than /api/events's 20/min
 * (a background batch-flush call, not a direct per-action UI trigger). 30/min
 * comfortably covers rapid replay behavior on a single exam screen while
 * still bounding worst-case Gemini TTS spend per student per minute if a
 * client malfunctions or loops.
 */
const TTS_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

/** Wraps raw 16-bit PCM mono audio in a minimal WAV (RIFF) container. */
function pcmToWav(pcm: Buffer, sampleRateHz: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRateHz * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * POST /api/tts/generate — student-facing, reads exam question/option text
 * aloud for the voice-driven exam-taking feature (Phase 1, MCQ only).
 *
 * EXPLICIT, SCOPED EXCEPTION to this project's "no AI inside the platform"
 * rule — see src/lib/ai.ts's top-of-file comment. Server-side only: the
 * Gemini API key never reaches the client, and the client only ever POSTs
 * plain text and receives back an audio stream — this is the whole reason
 * this proxy exists rather than calling Gemini directly from the Flutter
 * app (which would require shipping the API key inside the mobile binary).
 *
 * Requires an authenticated student (dual-auth, same as every exam route).
 * Not restricted to text that's actually part of a real exam question —
 * this is a thin TTS utility, not an exam-content-aware endpoint; nothing
 * about it depends on which exam or question the text came from.
 */
export async function POST(request: Request) {
  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`tts:${ctx.userId}`, TTS_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "عدد الطلبات كبير جداً، الرجاء المحاولة لاحقاً" },
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
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  let audio;
  try {
    audio = await synthesizeSpeech(parsed.data.text);
  } catch {
    return NextResponse.json({ error: "تعذر توليد الصوت، حاول مرة أخرى" }, { status: 502 });
  }

  const wav = pcmToWav(audio.pcm, audio.sampleRateHz);

  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-store",
    },
  });
}
