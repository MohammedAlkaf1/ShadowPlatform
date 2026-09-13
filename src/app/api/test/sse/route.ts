// TEMPORARY/DISPOSABLE — infrastructure viability test only.
//
// Determines whether Hostinger's reverse proxy allows a long-lived,
// incrementally-flushed HTTP response (Server-Sent Events), as a candidate
// transport for Deaf Mode if the existing WebSocket relay
// (server/ws-transcribe.js) turns out to be unusable on the current
// Hostinger plan (inbound WebSocket upgrades are not supported there — see
// the architecture investigation this test follows up on).
//
// No auth, no DB, no Deepgram, no real feature logic — delete this route
// once the viability question is answered either way.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 10_000;
// 14 heartbeats * 10s = 140s of server-driven activity, safely past the
// required 120s even if the very first event is slightly delayed.
const MAX_HEARTBEATS = 14;

export async function GET() {
  const encoder = new TextEncoder();
  let count = 0;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        controller.enqueue(
          encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ n: count, t: Date.now() })}\n\n`)
        );
        count += 1;
      };

      // First event immediately, before any interval delay.
      send();

      intervalId = setInterval(() => {
        send();
        if (count >= MAX_HEARTBEATS) {
          clearInterval(intervalId);
          controller.close();
        }
      }, HEARTBEAT_INTERVAL_MS);
    },
    cancel() {
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Harmless if no such proxy is in the path; disables response
      // buffering on the (unlikely, but possible) chance an Nginx layer
      // sits somewhere between Hostinger's edge and this Node process.
      "X-Accel-Buffering": "no",
    },
  });
}
