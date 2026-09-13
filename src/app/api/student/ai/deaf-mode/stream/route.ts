import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getOwnedSession, attachSseController, detachSseController } from "@/lib/deaf-mode-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * GET /api/student/ai/deaf-mode/stream?sessionId=... — Server-Sent Events.
 *
 * Replaces the direct Flutter -> Deepgram WebSocket receive side (Hostinger
 * Business does not accept inbound WebSocket upgrades — confirmed via a
 * live production probe — but does stream a long-lived HTTP/SSE response
 * cleanly: immediate first byte, no buffering, stable past 120s). Relays
 * each Deepgram transcript frame verbatim as an `event: transcript` SSE
 * event, byte-identical JSON to what the app's existing parser
 * (deepgram_parser.dart) already expects — only the transport differs.
 *
 * A dropped connection (network blip) is recoverable by simply calling this
 * endpoint again with the same sessionId — attachSseController replaces
 * whichever controller was previously registered; the session itself (and
 * its Deepgram connection) keeps running independently as long as audio
 * keeps arriving (see forwardAudioChunk's idle-timeout reset).
 */
export async function GET(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return new Response(JSON.stringify({ error: tErrors("invalidData") }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = getOwnedSession(sessionId, ctx.userId);
  if (!session) {
    return new Response(JSON.stringify({ error: tErrors("invalidData") }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let heartbeatId: ReturnType<typeof setInterval> | undefined;
  let thisController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      thisController = controller;
      attachSseController(sessionId, controller);
      controller.enqueue(encoder.encode(`event: ready\ndata: {}\n\n`));
      heartbeatId = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
        } catch {
          // Controller already closed — the interval is cleared in cancel().
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      // Fires when the client disconnects (Next.js/undici cancel the
      // stream on connection close). The session itself keeps running —
      // only this specific SSE subscription is torn down; a client that
      // reconnects just calls this endpoint again.
      if (heartbeatId) clearInterval(heartbeatId);
      if (thisController) detachSseController(sessionId, thisController);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
