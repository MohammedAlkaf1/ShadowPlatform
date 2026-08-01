import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";

/**
 * Route-level auth + RBAC gate for the web app's page routes.
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
 * since they implement the login flow itself.
 */

const ROLE_PREFIXES: Record<string, UserRole> = {
  "/student": "student",
  "/specialist": "specialist",
  "/faculty": "faculty",
  "/admin": "admin",
};

const PUBLIC_PATHS = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  const session = req.auth;
  if (!session?.user) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const matchedPrefix = Object.keys(ROLE_PREFIXES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (matchedPrefix) {
    const requiredRole = ROLE_PREFIXES[matchedPrefix];
    const userRole = session.user.role;
    if (userRole !== requiredRole && userRole !== "admin") {
      return NextResponse.redirect(new URL("/unauthorized", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
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
