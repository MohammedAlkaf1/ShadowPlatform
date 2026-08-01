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
  const session = await auth();
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
