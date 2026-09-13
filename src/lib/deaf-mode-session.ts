import WebSocket from "ws";

/**
 * Server-side session registry for Deaf Mode live transcription.
 *
 * ARCHITECTURE: Hostinger's Business plan does not accept inbound WebSocket
 * upgrades (confirmed via Hostinger's own docs and a live production probe —
 * see the SSE viability test this migration follows). This module replaces
 * the direct Flutter -> Deepgram WebSocket with:
 *   Flutter --HTTP POST audio chunks--> this server --WebSocket--> Deepgram
 *   Deepgram --WebSocket--> this server --SSE-->            Flutter
 * Outbound WebSocket connections (this server -> Deepgram) are unaffected by
 * Hostinger's restriction — only INBOUND upgrades to this app are blocked.
 *
 * This is a single-process, in-memory registry — appropriate for the
 * current one-Node-process Hostinger deployment (same judgment call as
 * src/lib/rate-limit.ts's in-memory store). No Redis/external session store
 * introduced.
 *
 * Deepgram config mirrors the exact real contract the Flutter app already
 * used directly (lib/custom_code/actions/transcription_mobile.dart) —
 * verified from that file, not guessed: model=nova-3, linear16/16000/mono,
 * smart_format+interim_results, `keyterm` repeated once per term (NOT
 * `keyterm[]` — that was this migration's own earlier, unverified guess in
 * the now-retired server/ws-transcribe.js). Message shape relayed to the
 * client is Deepgram's own raw JSON frame, byte-for-byte — the existing
 * Flutter parser (lib/services/deepgram_parser.dart) needs no changes to
 * its parsing logic, only to how it receives the JSON (SSE `data:` line
 * instead of a raw WebSocket text frame).
 */

const DEEPGRAM_MODEL = "nova-3";
const DEEPGRAM_ENCODING = "linear16";
const DEEPGRAM_SAMPLE_RATE = "16000";
const DEEPGRAM_CHANNELS = "1";
export const ALLOWED_DEAF_MODE_LANGUAGES = new Set(["ar", "en-US"]);
export type DeafModeLanguage = "ar" | "en-US";

const DEEPGRAM_CONNECT_TIMEOUT_MS = 8_000;
const IDLE_AUDIO_TIMEOUT_MS = 30_000; // no audio chunk for 30s => treat as abandoned
const MAX_SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2h ceiling, same as the retired WS proxy
export const MAX_CONCURRENT_SESSIONS_PER_USER = 2;
const MAX_AUDIO_CHUNK_BYTES = 64 * 1024; // one real 250-1000ms 16kHz mono PCM16 chunk is 8-32KB; headroom without allowing memory abuse
// A 250ms chunk cadence is ~4 chunks/sec; 20/sec gives real headroom for
// jitter/bursts while still bounding a malfunctioning/abusive client.
const MAX_CHUNKS_PER_SECOND = 20;

export interface DeafModeSession {
  id: string;
  userId: string;
  tenantId: string;
  createdAt: number;
  closed: boolean;
  deepgramSocket: WebSocket;
  sseController: ReadableStreamDefaultController<Uint8Array> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  maxDurationTimer: ReturnType<typeof setTimeout> | null;
  chunkWindowStart: number;
  chunkWindowCount: number;
}

const sessions = new Map<string, DeafModeSession>();
const activeSessionsByUser = new Map<string, number>();

export function activeSessionCountForUser(userId: string): number {
  return activeSessionsByUser.get(userId) || 0;
}

function incrementActive(userId: string) {
  activeSessionsByUser.set(userId, (activeSessionsByUser.get(userId) || 0) + 1);
}
function decrementActive(userId: string) {
  const current = activeSessionsByUser.get(userId) || 0;
  if (current <= 1) activeSessionsByUser.delete(userId);
  else activeSessionsByUser.set(userId, current - 1);
}

function buildDeepgramUrl(language: DeafModeLanguage, keyterms: string[]): string {
  const params = new URLSearchParams();
  params.set("model", DEEPGRAM_MODEL);
  params.set("encoding", DEEPGRAM_ENCODING);
  params.set("sample_rate", DEEPGRAM_SAMPLE_RATE);
  params.set("channels", DEEPGRAM_CHANNELS);
  params.set("smart_format", "true");
  params.set("interim_results", "true");
  params.set("language", language);
  for (const term of keyterms) {
    params.append("keyterm", term);
  }
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

/** Safe metadata-only logging — never audio, transcript, tokens, or the Deepgram key. */
function log(event: string, fields?: Record<string, string | number>) {
  const safe = fields ? " " + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ") : "";
  console.log(`[deaf-mode-session] ${event}${safe}`);
}

function sendSseEvent(session: DeafModeSession, eventName: string, data: unknown) {
  if (!session.sseController) return;
  const encoder = new TextEncoder();
  try {
    session.sseController.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
  } catch {
    // Controller already closed (client disconnected) — nothing to do.
  }
}

function resetIdleTimer(session: DeafModeSession) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => closeSession(session.id, "idle_timeout"), IDLE_AUDIO_TIMEOUT_MS);
}

/**
 * Creates a new session: opens the outbound Deepgram WebSocket and waits
 * for it to open (or fail) before returning, matching the same
 * fail-before-handshake-completes posture as the retired WS proxy. Returns
 * null if Deepgram couldn't be reached in time — caller must respond 502.
 */
export async function createDeafModeSession(
  userId: string,
  tenantId: string,
  language: DeafModeLanguage,
  keyterms: string[]
): Promise<DeafModeSession | null> {
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    log("rejected", { reason: "provider_not_configured" });
    return null;
  }

  const deepgramSocket = new WebSocket(buildDeepgramUrl(language, keyterms), {
    headers: { Authorization: `Token ${deepgramKey}` },
  });

  const opened = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      deepgramSocket.terminate();
      resolve(false);
    }, DEEPGRAM_CONNECT_TIMEOUT_MS);
    deepgramSocket.once("open", () => {
      clearTimeout(timer);
      resolve(true);
    });
    deepgramSocket.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

  if (!opened) {
    log("rejected", { reason: "provider_connect_failed", userId });
    return null;
  }

  const id = crypto.randomUUID();
  const session: DeafModeSession = {
    id,
    userId,
    tenantId,
    createdAt: Date.now(),
    closed: false,
    deepgramSocket,
    sseController: null,
    idleTimer: null,
    maxDurationTimer: setTimeout(() => closeSession(id, "max_duration_reached"), MAX_SESSION_DURATION_MS),
    chunkWindowStart: Date.now(),
    chunkWindowCount: 0,
  };
  resetIdleTimer(session);

  deepgramSocket.on("message", (data: WebSocket.RawData) => {
    // Relayed verbatim, unparsed — the existing Flutter parser
    // (deepgram_parser.dart) already knows how to read this exact JSON
    // shape; this server never needs to understand it.
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    sendSseEvent(session, "transcript", parsed);
  });
  deepgramSocket.on("close", () => closeSession(id, "provider_disconnected"));
  deepgramSocket.on("error", () => closeSession(id, "provider_error"));

  sessions.set(id, session);
  incrementActive(userId);
  log("created", { userId, sessionId: id });
  return session;
}

export function getOwnedSession(sessionId: string, userId: string): DeafModeSession | null {
  const session = sessions.get(sessionId);
  if (!session || session.closed || session.userId !== userId) return null;
  return session;
}

export interface ChunkResult {
  ok: boolean;
  reason?: "not_found" | "closed" | "too_large" | "rate_limited";
}

/** Forwards one audio chunk to the session's Deepgram connection. Never buffers — sent immediately or dropped. */
export function forwardAudioChunk(sessionId: string, userId: string, chunk: Buffer): ChunkResult {
  const session = getOwnedSession(sessionId, userId);
  if (!session) return { ok: false, reason: "not_found" };
  if (chunk.byteLength > MAX_AUDIO_CHUNK_BYTES) return { ok: false, reason: "too_large" };

  const now = Date.now();
  if (now - session.chunkWindowStart >= 1000) {
    session.chunkWindowStart = now;
    session.chunkWindowCount = 0;
  }
  session.chunkWindowCount += 1;
  if (session.chunkWindowCount > MAX_CHUNKS_PER_SECOND) {
    return { ok: false, reason: "rate_limited" };
  }

  resetIdleTimer(session);
  if (session.deepgramSocket.readyState === WebSocket.OPEN) {
    session.deepgramSocket.send(chunk);
  }
  return { ok: true };
}

/** Attaches (or replaces) the SSE stream controller for a session — a client re-subscribing (e.g. after a network blip) simply calls the stream endpoint again. */
export function attachSseController(sessionId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.sseController = controller;
}

export function detachSseController(sessionId: string, controller: ReadableStreamDefaultController<Uint8Array>) {
  const session = sessions.get(sessionId);
  if (session && session.sseController === controller) {
    session.sseController = null;
  }
}

/**
 * Graceful stop: sends Deepgram's documented CloseStream control message so
 * it flushes a final transcript, gives it a short grace window to arrive,
 * then tears down both sides. Used for both explicit user-initiated stop
 * and every other terminal path (idle timeout, max duration, disconnects,
 * provider errors) via closeSession below.
 */
export async function stopSessionGracefully(sessionId: string, userId: string): Promise<boolean> {
  const session = getOwnedSession(sessionId, userId);
  if (!session) return false;

  if (session.deepgramSocket.readyState === WebSocket.OPEN) {
    try {
      session.deepgramSocket.send(JSON.stringify({ type: "CloseStream" }));
    } catch {
      // Already closing — fall through to cleanup below.
    }
    // Short grace window for Deepgram's final flushed transcript to arrive
    // and be relayed via the "message" handler before we tear down.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  closeSession(sessionId, "client_stop");
  return true;
}

function closeSession(sessionId: string, reason: string) {
  const session = sessions.get(sessionId);
  if (!session || session.closed) return;
  session.closed = true;

  if (session.idleTimer) clearTimeout(session.idleTimer);
  if (session.maxDurationTimer) clearTimeout(session.maxDurationTimer);

  sendSseEvent(session, "session_ended", { reason });
  try {
    session.sseController?.close();
  } catch {
    // Already closed.
  }
  try {
    session.deepgramSocket.close();
  } catch {
    // Already closed.
  }

  sessions.delete(sessionId);
  decrementActive(session.userId);
  log("closed", { userId: session.userId, sessionId, reason, durationMs: Date.now() - session.createdAt });
}
