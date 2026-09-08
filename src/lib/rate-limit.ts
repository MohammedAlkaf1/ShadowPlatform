/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Deliberately simple for this stage: a single-process in-memory Map is
 * fine because this app runs as one Next.js server process locally/in this
 * deployment size; it resets on restart and doesn't share state across
 * horizontally-scaled instances. If/when this runs behind multiple
 * instances, swap the store for Redis (e.g. `INCR` + `EXPIRE`) — the
 * `checkRateLimit` call site wouldn't need to change, only this file.
 */

interface WindowState {
  count: number;
  windowStartMs: number;
}

const store = new Map<string, WindowState>();

// Opportunistic cleanup so `store` doesn't grow unbounded over a long
// process lifetime — sweep old windows every 10 minutes.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();
function sweepIfDue(nowMs: number, windowMs: number) {
  if (nowMs - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = nowMs;
  for (const [key, state] of store) {
    if (nowMs - state.windowStartMs > windowMs) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Fixed-window check-and-increment for `key`. Call once per incoming
 * request; the returned `allowed` tells the caller whether to reject with
 * 429.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepIfDue(now, options.windowMs);

  const existing = store.get(key);
  if (!existing || now - existing.windowStartMs >= options.windowMs) {
    store.set(key, { count: 1, windowStartMs: now });
    return { allowed: true, limit: options.limit, remaining: options.limit - 1, resetAt: now + options.windowMs };
  }

  existing.count += 1;
  const allowed = existing.count <= options.limit;
  return {
    allowed,
    limit: options.limit,
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.windowStartMs + options.windowMs,
  };
}

/** Test/dev-only: clears all rate-limit state. */
export function resetRateLimitStore(): void {
  store.clear();
}

/**
 * Best-effort client IP for rate-limit keys — same x-forwarded-for/x-real-ip
 * precedence as src/lib/audit.ts's own extraction, duplicated here rather
 * than shared since audit.ts's version is async (reads next/headers) and
 * this one takes a plain Request directly (route handlers already have it
 * on hand, no need for the headers() indirection).
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
