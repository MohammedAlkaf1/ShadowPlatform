import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";

/**
 * Route-level auth + RBAC gate for the web app's page routes, PLUS
 * nonce-based CSP generation (see the buildCsp/applySecurityHeaders helpers
 * below).
 *
 * - Resolves the session (tenantId/role/userId) server-side from the signed
 *   JWT cookie — never trusts client input.
 * - Redirects unauthenticated users to /login.
 * - Enforces that each role-prefixed area (/student, /specialist, /faculty,
 *   /admin) is only reachable by its matching role. Admin is additionally
 *   allowed into every area since admin has university-wide access.
 *
 * API routes under /api/* (used by the Flutter app) are NOT covered by this
 * middleware — they authenticate via a Bearer JWT checked inside each route
 * handler (see src/lib/mobile-jwt.ts), since a native app has no browser
 * session cookie. NextAuth's own /api/auth/* routes are also excluded here
 * since they implement the login flow itself. (The static
 * Content-Security-Policy in next.config.ts still covers /api/* responses —
 * only page routes get the nonce-based variant here, since API responses
 * are JSON and never execute a script in the first place.)
 */

const ROLE_PREFIXES: Record<string, UserRole> = {
  "/student": "student",
  "/specialist": "specialist",
  "/faculty": "faculty",
  "/admin": "admin",
};

const PUBLIC_PATHS = ["/login", "/register", "/privacy"];

const isDev = process.env.NODE_ENV !== "production";

/**
 * Nonce-based CSP for page routes — replaces next.config.ts's static
 * 'unsafe-inline' on script-src with a per-request nonce, which Next.js's
 * own script/style injection automatically picks up via the `x-nonce`
 * request header set below (the framework's documented mechanism — see
 * https://nextjs.org/docs/app/guides/content-security-policy). This is real
 * XSS-mitigation value 'unsafe-inline' can't provide: an attacker-injected
 * inline `<script>` has no way to know the per-request nonce, so it won't
 * execute even if HTML injection itself isn't otherwise prevented.
 * 'strict-dynamic' lets scripts the nonce'd script itself loads (Next's own
 * chunk-loading) run without each needing their own nonce — the standard
 * pairing for a nonce-based CSP with a bundler that does dynamic imports.
 * 'unsafe-eval' stays dev-only for the same Fast Refresh reason as before.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  const nextOptions = { request: { headers: requestHeaders } };

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname === "/"
  ) {
    return applySecurityHeaders(NextResponse.next(nextOptions), nonce);
  }

  const session = req.auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce);
  }

  const matchedPrefix = Object.keys(ROLE_PREFIXES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (matchedPrefix) {
    const requiredRole = ROLE_PREFIXES[matchedPrefix];
    const userRole = session.user.role;
    if (userRole !== requiredRole && userRole !== "admin") {
      return applySecurityHeaders(NextResponse.redirect(new URL("/unauthorized", req.nextUrl.origin)), nonce);
    }
  }

  return applySecurityHeaders(NextResponse.next(nextOptions), nonce);
});

export const config = {
  matcher: [
    /*
     * Match all page routes except:
     * - /api (own auth handling)
     * - /_next/static, /_next/image (Next.js internals)
     * - static asset files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
