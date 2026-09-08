import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import type { UserRole } from "@prisma/client";
import { extractBearerToken, verifyMobileToken } from "./mobile-jwt";
import { prisma } from "./prisma";
import { getRequestContext, type RequestContext } from "./session";

/**
 * Auth guard for the Flutter-app-facing /api/* endpoints. These are
 * authenticated with a standalone Bearer JWT (see mobile-jwt.ts), NOT the
 * NextAuth session cookie — a native app has no browser cookie jar. tenantId
 * and role always come from the verified token's claims (re-checked against
 * the DB row to catch deactivated/deleted accounts), never from request
 * body/query, so downstream queries can trust it for tenant scoping.
 */
export async function getMobileRequestContext(request: Request): Promise<RequestContext | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  try {
    const claims = await verifyMobileToken(token);
    if (claims.type !== "access") return null;

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

    return { userId: user.id, tenantId: user.tenantId, role: user.role };
  } catch {
    return null;
  }
}

export async function unauthorizedResponse(message?: string): Promise<NextResponse> {
  const resolvedMessage = message ?? (await getTranslations("Common.errors"))("unauthorized");
  return NextResponse.json({ error: resolvedMessage }, { status: 401 });
}

export async function forbiddenResponse(message?: string): Promise<NextResponse> {
  const resolvedMessage = message ?? (await getTranslations("Common.errors"))("notAuthorizedResource");
  return NextResponse.json({ error: resolvedMessage }, { status: 403 });
}

export type ApiRoleResult =
  | { ok: true; ctx: RequestContext }
  // `ctx` is included on the role-forbidden branch (but not the
  // unauthenticated one, where there's no known actor) so callers can still
  // write an AuditLog row for a denied access attempt — AuditLog.actorUserId
  // is a required field, so there's nothing to log against when there's no
  // authenticated user at all.
  | { ok: false; response: NextResponse; ctx?: RequestContext };

export async function requireMobileRole(request: Request, ...roles: UserRole[]): Promise<ApiRoleResult> {
  const ctx = await getMobileRequestContext(request);
  if (!ctx) {
    return { ok: false, response: await unauthorizedResponse() };
  }
  if (roles.length > 0 && !roles.includes(ctx.role)) {
    return { ok: false, response: await forbiddenResponse(), ctx };
  }
  return { ok: true, ctx };
}

/**
 * Resolves the request context from EITHER credential type an /api/* route
 * might legitimately receive: a mobile Bearer JWT (native app, no cookie
 * jar) or a NextAuth web session cookie (browser). Tried in that order —
 * if an Authorization header is present it's an unambiguous mobile-app
 * request, so that's checked first; otherwise falls back to the session
 * cookie a browser would send. A request can't plausibly present both, so
 * this is a straightforward "try A, then B", not a merge of two identities.
 *
 * Use this (via requireApiRole below) for any endpoint that must serve
 * BOTH the Flutter app and the web app — most /api/* routes are
 * mobile-only by design and should keep using requireMobileRole/
 * getMobileRequestContext directly instead.
 */
export async function getAnyRequestContext(request: Request): Promise<RequestContext | null> {
  const mobileCtx = await getMobileRequestContext(request);
  if (mobileCtx) return mobileCtx;
  return getRequestContext();
}

/** Same contract as requireMobileRole, but accepts either auth channel — see getAnyRequestContext. */
export async function requireApiRole(request: Request, ...roles: UserRole[]): Promise<ApiRoleResult> {
  const ctx = await getAnyRequestContext(request);
  if (!ctx) {
    return { ok: false, response: await unauthorizedResponse() };
  }
  if (roles.length > 0 && !roles.includes(ctx.role)) {
    return { ok: false, response: await forbiddenResponse(), ctx };
  }
  return { ok: true, ctx };
}
