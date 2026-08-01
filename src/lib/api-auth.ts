import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { extractBearerToken, verifyMobileToken } from "./mobile-jwt";
import { prisma } from "./prisma";
import type { RequestContext } from "./session";

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
    if (!user || !user.active || user.deletedAt || user.tenantId !== claims.tenantId) {
      return null;
    }

    return { userId: user.id, tenantId: user.tenantId, role: user.role };
  } catch {
    return null;
  }
}

export function unauthorizedResponse(message = "غير مصرح"): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = "لا تملك صلاحية الوصول"): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireMobileRole(request: Request, ...roles: UserRole[]): Promise<
  | { ok: true; ctx: RequestContext }
  // `ctx` is included on the role-forbidden branch (but not the
  // unauthenticated one, where there's no known actor) so callers can still
  // write an AuditLog row for a denied access attempt — AuditLog.actorUserId
  // is a required field, so there's nothing to log against when there's no
  // authenticated user at all.
  | { ok: false; response: NextResponse; ctx?: RequestContext }
> {
  const ctx = await getMobileRequestContext(request);
  if (!ctx) {
    return { ok: false, response: unauthorizedResponse() };
  }
  if (roles.length > 0 && !roles.includes(ctx.role)) {
    return { ok: false, response: forbiddenResponse(), ctx };
  }
  return { ok: true, ctx };
}
