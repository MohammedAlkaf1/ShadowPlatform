import { auth } from "@/auth";
import type { UserRole } from "@prisma/client";

export interface RequestContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

/**
 * Resolves the authenticated request context from the NextAuth session.
 * tenantId/role/userId always come from the server-verified JWT session —
 * NEVER from client-supplied headers/body/query — so every Prisma query
 * downstream can trust it for tenant scoping.
 *
 * Returns null if there is no valid session (caller should respond 401).
 */
export async function getRequestContext(): Promise<RequestContext | null> {
  let session;
  try {
    session = await auth();
  } catch {
    // auth() reads the request-scoped cookie jar via next/headers, which
    // only exists inside Next's own request-handling machinery. A route
    // that legitimately has no session (e.g. an unauthenticated request
    // falling through from the mobile-JWT check in getAnyRequestContext)
    // should resolve to "no session" the same way a present-but-invalid
    // cookie already does below - not bubble up as an unhandled 500. This
    // also fails closed for any other unexpected error reading the
    // session, which is the right default for an auth resolver.
    return null;
  }
  if (!session?.user?.id || !session.user.tenantId || !session.user.role) {
    return null;
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
  };
}

export async function requireRole(...roles: UserRole[]): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) {
    throw new AuthError("UNAUTHENTICATED", "لم يتم تسجيل الدخول");
  }
  if (!roles.includes(ctx.role)) {
    throw new AuthError("FORBIDDEN", "لا تملك صلاحية الوصول لهذا المورد");
  }
  return ctx;
}

export class AuthError extends Error {
  code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
    super(message);
    this.code = code;
  }
}
