// Deepgram live-transcription WebSocket relay — server/ws-transcribe.js
//
// ═══════════════════════════════════════════════════════════════════════
// WHY THIS FILE IS PLAIN COMMONJS, NOT TYPESCRIPT
// ═══════════════════════════════════════════════════════════════════════
// server.js (this app's custom production entrypoint, see its own header
// comment) is executed directly by `node server.js` — it is NOT compiled
// by Next.js's build pipeline. Hostinger's production install runs under
// NODE_ENV=production, which causes `npm ci` to skip devDependencies
// entirely (this is already the documented reason next.config.ts excludes
// tests/ from the type-check: vitest, a devDependency, isn't resolvable at
// build time either). That means:
//   - TypeScript itself can't be assumed present at runtime.
//   - `tsx` (which could transpile .ts on the fly) is a devDependency and
//     is NOT available in production.
// So this file — required directly by server.js — cannot be TypeScript,
// and cannot import src/lib/mobile-jwt.ts, src/lib/tenant-db.ts, or
// src/lib/rate-limit.ts directly (all three are .ts).
//
// This does NOT mean re-inventing cryptographic JWT verification. `jose`
// (the real library src/lib/mobile-jwt.ts uses) is already a real,
// non-dev, transitively-required runtime dependency of this project today
// (next-auth -> @auth/core -> jose) — it is physically present in
// node_modules in every environment this app already runs in, including
// production, because NextAuth's own login flow cannot function without
// it. `jose`'s package.json declares `"type": "module"` (ESM-only), which
// is why this CommonJS file uses a dynamic `await import("jose")` instead
// of `require("jose")` — Node supports awaiting a dynamic import of an ESM
// package from a CommonJS module natively, no bundler/transpiler needed
// (verified locally before writing this file). The actual signature/expiry
// verification below is the REAL `jose.jwtVerify()` call — identical to
// what src/lib/mobile-jwt.ts's verifyMobileToken does, same secret
// (NEXTAUTH_SECRET), same algorithm (HS256), same claim shape.
//
// What IS reimplemented here, and why that's safe:
//   - The "read the claims, then check them against the DB" glue that
//     src/lib/api-auth.ts's getMobileRequestContext performs (active /
//     deletedAt / tenantId match / tokenVersion match) is business logic,
//     not cryptography — it's transliterated here in plain JS because the
//     TS file itself can't be imported, not because the logic is
//     untrusted. If getMobileRequestContext's checks ever change, this
//     block must be updated to match — see the comment right above it.
//   - The fixed-window rate limiter mirrors src/lib/rate-limit.ts's
//     checkRateLimit exactly (a dependency-free ~20-line Map/Date.now()
//     counter, no cryptography, no security boundary of its own beyond
//     "count requests"). If rate-limit.ts's algorithm ever changes, this
//     copy must be updated to match.
//   - Tenant isolation: src/lib/tenant-db.ts's getTenantScopedPrisma is a
//     generic Prisma `$extends` middleware (TypeScript) that can't be
//     imported here either. Instead, every query this file makes includes
//     `tenantId` explicitly in its own `where` clause by hand — achieving
//     the same effect for these specific queries without importing the
//     generic machinery.
//
// This file is the ONLY place in the codebase that holds/uses
// DEEPGRAM_API_KEY — mirroring src/lib/ai.ts's role for GEMINI_API_KEY.
// ═══════════════════════════════════════════════════════════════════════

const { WebSocketServer, WebSocket } = require("ws");
const { PrismaClient } = require("@prisma/client");

// A second, independent PrismaClient instance for this process. server.js
// runs as one long-lived process (not per-request), so this is one extra
// connection pool for the whole process's lifetime, not a per-connection
// leak. It cannot reuse src/lib/prisma.ts's singleton — that instance lives
// inside Next's own bundled module graph, unreachable from this separate
// CommonJS require() context.
const prisma = new PrismaClient();

const WS_PATH = "/api/ws/transcribe";

// ── Fixed, server-controlled Deepgram configuration — never client-overridable ──
const DEEPGRAM_MODEL = "nova-3";
const DEEPGRAM_ENCODING = "linear16";
const DEEPGRAM_SAMPLE_RATE = "16000";
const DEEPGRAM_CHANNELS = "1";
const ALLOWED_LANGUAGES = new Set(["ar", "en", "multi"]);

// ── Resource limits (new judgment calls — no prior WebSocket precedent existed
// in this codebase to match; documented explicitly per the task's request) ──
const MAX_MESSAGE_BYTES = 64 * 1024; // one real PCM16 audio frame is a few KB; 64KB gives headroom without allowing arbitrary memory abuse
const IDLE_TIMEOUT_MS = 30_000; // no audio frame for 30s => treat as an abandoned connection
const MAX_CONNECTION_DURATION_MS = 2 * 60 * 60 * 1000; // 2h ceiling — a very long lecture/exam session, not a normal-use limit
const MAX_CONCURRENT_SESSIONS_PER_USER = 2; // one active lecture/exam session + brief overlap during a client-side reconnect
const DEEPGRAM_CONNECT_TIMEOUT_MS = 8_000;

// ── Close-code map for every post-connection cleanup path — 4000-4999 is the
// WebSocket spec's reserved private-use range, used here so the Flutter
// client can distinguish *why* a session ended (e.g. to decide whether to
// auto-reconnect on idle_timeout but not on max_duration_reached) instead
// of every path closing with the same undifferentiated code. ──
const CLOSE_REASONS = {
  client_disconnected: [1000, "client_disconnected"],
  client_error: [1011, "client_error"],
  provider_disconnected: [1000, "provider_disconnected"],
  provider_error: [1011, "provider_error"],
  idle_timeout: [4001, "idle_timeout"],
  max_duration_reached: [4002, "max_duration_reached"],
};

/**
 * Rate limit: 10 connection attempts per 10-minute window per student.
 * Deliberately much lower than the per-request limits on the migrated
 * Gemini endpoints (src/app/api/student/ai/*) because a single connection
 * here is long-lived (an entire lecture/exam), not a single request — 10
 * attempts/10min comfortably covers a handful of reconnects after a
 * dropped connection while blocking a reconnect-loop from opening
 * unbounded upstream Deepgram sessions.
 */
const CONNECT_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

// ── Rate limiter — mirrors src/lib/rate-limit.ts's checkRateLimit exactly ──
const rateLimitStore = new Map();
function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const existing = rateLimitStore.get(key);
  if (!existing || now - existing.windowStartMs >= windowMs) {
    rateLimitStore.set(key, { count: 1, windowStartMs: now });
    return { allowed: true };
  }
  existing.count += 1;
  return { allowed: existing.count <= limit };
}

// ── Concurrency tracking (per authenticated userId) ──
const activeSessionsByUser = new Map(); // userId -> count

function incrementActiveSessions(userId) {
  activeSessionsByUser.set(userId, (activeSessionsByUser.get(userId) || 0) + 1);
}
function decrementActiveSessions(userId) {
  const current = activeSessionsByUser.get(userId) || 0;
  if (current <= 1) activeSessionsByUser.delete(userId);
  else activeSessionsByUser.set(userId, current - 1);
}

/** Rejects an upgrade attempt before any WebSocket handshake completes. Never logs the reason's raw input, only a fixed category. */
function rejectUpgrade(socket, statusCode, statusText) {
  try {
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\n\r\n`);
  } catch {
    // Socket may already be closed by the client — nothing to do.
  }
  socket.destroy();
}

/**
 * Verifies the mobile Bearer JWT the same way src/lib/api-auth.ts's
 * getMobileRequestContext does: real jose.jwtVerify (HS256, NEXTAUTH_SECRET)
 * for the signature/expiry, then the same DB re-validation (active,
 * !deletedAt, tenantId match, tokenVersion match) against the live User row
 * — so a role change, deactivation, or "sign out everywhere" action
 * invalidates an outstanding token exactly as it does for every other
 * mobile API route. Returns the verified { userId, tenantId, role } or null.
 */
async function authenticate(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  let claims;
  try {
    const jose = await import("jose");
    // Explicit algorithm allowlist — same reasoning as mobile-jwt.ts's
    // verifyMobileToken (see its own comment): jose's key-type inference
    // already blocks "none"/asymmetric algorithms for a raw symmetric
    // secret, but pinning to HS256 removes the remaining HS384/HS512
    // ambiguity. Every token this app issues is HS256.
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    claims = payload;
  } catch {
    // Invalid signature, malformed token, or expired — never distinguish
    // these to the caller (same posture as verifyMobileToken's callers).
    return null;
  }

  if (claims.type !== "access") return null;
  if (typeof claims.userId !== "string" || typeof claims.tenantId !== "string") return null;

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (
    !user ||
    !user.active ||
    user.deletedAt ||
    user.tenantId !== claims.tenantId ||
    user.tokenVersion !== claims.tokenVersion
  ) {
    return null;
  }

  // This endpoint is student-only (matches both live Deepgram consumers —
  // deaf-mode transcription and voice-exam answer capture — which are both
  // student-facing features; no faculty/specialist/admin use case exists).
  if (user.role !== "student") return null;

  return { userId: user.id, tenantId: user.tenantId, role: user.role };
}

/**
 * Resolves approved keyterms for `courseCode`, scoped to the authenticated
 * student's own tenant and real course enrollment — the exact same
 * authorization/query shape as GET /api/courses/[courseCode]/keyterms
 * (src/app/api/courses/[courseCode]/keyterms/route.ts), transliterated to
 * plain JS for the same CommonJS-boundary reason as the rest of this file.
 * Returns `null` if the student has no real enrollment in this course
 * (including the case where courseCode doesn't exist at all) — the caller
 * must reject the connection in that case, same "don't confirm existence"
 * posture as the HTTP route.
 */
async function resolveApprovedKeyterms(tenantId, userId, courseCode) {
  const studentProfile = await prisma.studentProfile.findFirst({
    where: { userId, tenantId },
  });
  if (!studentProfile) return null;

  const links = await prisma.facultyCourseLink.findMany({
    where: { studentProfileId: studentProfile.id, courseCode, tenantId },
    select: { facultyUserId: true },
  });
  if (links.length === 0) return null;

  const keyterms = await prisma.lectureKeyterm.findMany({
    where: {
      courseCode,
      approved: true,
      deletedAt: null,
      tenantId,
      facultyUserId: { in: links.map((l) => l.facultyUserId) },
    },
    orderBy: { term: "asc" },
    select: { term: true },
  });
  return keyterms.map((k) => k.term);
}

function buildDeepgramUrl(language, keyterms) {
  const params = new URLSearchParams();
  params.set("model", DEEPGRAM_MODEL);
  params.set("encoding", DEEPGRAM_ENCODING);
  params.set("sample_rate", DEEPGRAM_SAMPLE_RATE);
  params.set("channels", DEEPGRAM_CHANNELS);
  params.set("smart_format", "true");
  params.set("interim_results", "true");
  params.set("language", language);
  for (const term of keyterms) {
    params.append("keyterm[]", term);
  }
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

/** Safe metadata-only logging — never the token, header, key, audio, or transcript. */
function log(event, fields) {
  const safe = fields ? ` ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ")}` : "";
  console.log(`[ws/transcribe] ${event}${safe}`);
}

/**
 * Attaches the /api/ws/transcribe upgrade handler to `httpServer`. Every
 * OTHER upgrade path (e.g. Next's own dev-mode HMR websocket) is delegated
 * to `nextApp.getUpgradeHandler()` — Next's own documented hook for a
 * custom server to preserve its normal upgrade behavior — so this proxy
 * cannot break anything else that relies on the HTTP upgrade mechanism.
 */
function attachTranscribeProxy(httpServer, nextApp) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  httpServer.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "http://internal");
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }

    if (url.pathname !== WS_PATH) {
      nextApp.getUpgradeHandler()(req, socket, head);
      return;
    }

    handleTranscribeUpgrade(req, socket, head, url, wss).catch((err) => {
      log("internal_error", { message: err && err.message ? "handler_failed" : "unknown" });
      rejectUpgrade(socket, 500, "Internal Server Error");
    });
  });
}

async function handleTranscribeUpgrade(req, socket, head, url, wss) {
  const auth = await authenticate(req.headers["authorization"]);
  if (!auth) {
    log("rejected", { reason: "unauthenticated" });
    rejectUpgrade(socket, 401, "Unauthorized");
    return;
  }

  const rate = checkRateLimit(`ws-transcribe-connect:${auth.userId}`, CONNECT_RATE_LIMIT);
  if (!rate.allowed) {
    log("rejected", { reason: "rate_limited", userId: auth.userId });
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }

  const activeCount = activeSessionsByUser.get(auth.userId) || 0;
  if (activeCount >= MAX_CONCURRENT_SESSIONS_PER_USER) {
    log("rejected", { reason: "too_many_concurrent_sessions", userId: auth.userId });
    rejectUpgrade(socket, 429, "Too Many Requests");
    return;
  }

  const language = url.searchParams.get("language");
  if (!ALLOWED_LANGUAGES.has(language)) {
    log("rejected", { reason: "invalid_language", userId: auth.userId });
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }

  const courseCode = url.searchParams.get("courseCode");
  let keyterms = [];
  if (courseCode) {
    const resolved = await resolveApprovedKeyterms(auth.tenantId, auth.userId, courseCode);
    if (resolved === null) {
      log("rejected", { reason: "unauthorized_course", userId: auth.userId });
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    keyterms = resolved;
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    log("rejected", { reason: "provider_not_configured" });
    rejectUpgrade(socket, 502, "Bad Gateway");
    return;
  }

  const deepgramUrl = buildDeepgramUrl(language, keyterms);
  const deepgramSocket = new WebSocket(deepgramUrl, {
    headers: { Authorization: `Token ${deepgramKey}` },
  });

  const connectTimer = setTimeout(() => {
    deepgramSocket.terminate();
  }, DEEPGRAM_CONNECT_TIMEOUT_MS);

  // Guards against a real leak: if the client aborts the raw upgrade socket
  // WHILE we're still waiting on Deepgram to open, `wss.handleUpgrade` later
  // silently no-ops on the dead socket (verified in ws's own source —
  // completeUpgrade destroys and returns without invoking our callback), so
  // `runRelay` (which owns all the deepgramSocket cleanup) would never run
  // and the in-flight Deepgram connection would be left open indefinitely.
  // Listening for the raw socket's own close/error here — independently of
  // the wrapped WebSocket object that doesn't exist yet — closes that gap.
  let clientAbortedDuringConnect = false;
  function onClientAbortDuringConnect() {
    clientAbortedDuringConnect = true;
    clearTimeout(connectTimer);
    deepgramSocket.terminate();
  }
  socket.once("close", onClientAbortDuringConnect);
  socket.once("error", onClientAbortDuringConnect);

  function stopWatchingClientAbort() {
    socket.removeListener("close", onClientAbortDuringConnect);
    socket.removeListener("error", onClientAbortDuringConnect);
  }

  deepgramSocket.once("open", () => {
    clearTimeout(connectTimer);
    stopWatchingClientAbort();
    if (clientAbortedDuringConnect) {
      deepgramSocket.terminate();
      return;
    }
    wss.handleUpgrade(req, socket, head, (clientSocket) => {
      runRelay(clientSocket, deepgramSocket, auth);
    });
  });

  deepgramSocket.once("error", () => {
    clearTimeout(connectTimer);
    stopWatchingClientAbort();
    if (clientAbortedDuringConnect) return; // client is already gone — nothing to reject
    log("rejected", { reason: "provider_connect_failed", userId: auth.userId });
    rejectUpgrade(socket, 502, "Bad Gateway");
  });
}

/** Wires up the bidirectional relay for one authenticated session and every cleanup path. */
function runRelay(clientSocket, deepgramSocket, auth) {
  incrementActiveSessions(auth.userId);
  const startedAt = Date.now();
  let closed = false;

  log("connected", { userId: auth.userId });

  const idleTimer = { handle: null };
  function resetIdleTimer() {
    if (idleTimer.handle) clearTimeout(idleTimer.handle);
    idleTimer.handle = setTimeout(() => cleanup("idle_timeout"), IDLE_TIMEOUT_MS);
  }
  resetIdleTimer();

  const maxDurationTimer = setTimeout(() => cleanup("max_duration_reached"), MAX_CONNECTION_DURATION_MS);

  function cleanup(reason) {
    if (closed) return;
    closed = true;
    clearTimeout(idleTimer.handle);
    clearTimeout(maxDurationTimer);
    decrementActiveSessions(auth.userId);
    const [code, message] = CLOSE_REASONS[reason] || [1011, "unknown"];
    // Closing an already-closing/closed socket is a documented no-op in
    // `ws` (checked via readyState internally) — safe to call unconditionally
    // on both sides regardless of which one actually triggered `reason`.
    try {
      clientSocket.close(code, message);
    } catch {
      // already closed
    }
    try {
      deepgramSocket.close(code, message);
    } catch {
      // already closed
    }
    log("closed", { userId: auth.userId, reason, code, durationMs: Date.now() - startedAt });
  }

  // Relay: client audio -> Deepgram. Backpressure guard — if Deepgram's own
  // send buffer is building up (its socket can't keep up), drop this frame
  // rather than buffering unboundedly; live audio tolerates occasional
  // dropped frames far better than unbounded memory growth.
  clientSocket.on("message", (data) => {
    resetIdleTimer();
    if (deepgramSocket.readyState !== WebSocket.OPEN) return;
    if (deepgramSocket.bufferedAmount > MAX_MESSAGE_BYTES * 8) return;
    deepgramSocket.send(data);
  });

  // Relay: Deepgram transcript events -> client. Same backpressure guard.
  deepgramSocket.on("message", (data) => {
    if (clientSocket.readyState !== WebSocket.OPEN) return;
    if (clientSocket.bufferedAmount > MAX_MESSAGE_BYTES * 8) return;
    clientSocket.send(data);
  });

  clientSocket.on("close", () => cleanup("client_disconnected"));
  clientSocket.on("error", () => cleanup("client_error"));
  deepgramSocket.on("close", () => cleanup("provider_disconnected"));
  deepgramSocket.on("error", () => cleanup("provider_error"));
}

module.exports = { attachTranscribeProxy };
