import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { forwardAudioChunk } from "@/lib/deaf-mode-session";

/**
 * POST /api/student/ai/deaf-mode/audio?sessionId=... — raw binary body
 * (Content-Type: application/octet-stream), one short PCM16/16kHz/mono
 * chunk (target 250-1000ms, same format the app already records — see
 * transcription_mobile.dart's RecordConfig). No base64/multipart — plain
 * bytes read via request.arrayBuffer(), forwarded immediately to the
 * session's Deepgram connection; nothing is buffered or persisted here.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const arrayBuffer = await request.arrayBuffer().catch(() => null);
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  // Ownership (sessionId -> userId) is verified inside forwardAudioChunk via
  // getOwnedSession — a sessionId alone, without a valid token for the SAME
  // user who created it, is never sufficient.
  const result = forwardAudioChunk(sessionId, ctx.userId, Buffer.from(arrayBuffer));
  if (!result.ok) {
    const status = result.reason === "rate_limited" ? 429 : result.reason === "too_large" ? 413 : 404;
    return NextResponse.json({ error: tErrors("invalidData") }, { status });
  }

  return new NextResponse(null, { status: 204 });
}
