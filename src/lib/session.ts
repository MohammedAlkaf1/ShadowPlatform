import { auth } from "@/auth";
import { getLocale, getTranslations } from "next-intl/server";
import { localize } from "@/lib/localize";
import type { UserRole } from "@prisma/client";

export interface RequestContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  // Optional: only populated by the web-session path (getRequestContext
  // below), straight off the JWT session — never an extra DB round trip.
  // The mobile-JWT path (api-auth.ts's getMobileRequestContext) leaves
  // these undefined; it has no equivalent free source for them and no
  // caller of that path needs them (AppShell, the only consumer, is
  // web-only).
  userEmail?: string;
  userFullName?: string;
  tenantName?: string;
  userSessionId?: string;
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
  // Real English rendering of the signed-in user's own name/university —
  // both come straight off the JWT (fullNameEn/tenantNameEn, set at
  // sign-in from User.fullNameEn/Tenant.nameEn) alongside their Arabic
  // originals, never machine-translated here.
  const locale = await getLocale();
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
    userEmail: session.user.email ?? "",
    userFullName: localize(session.user.fullName ?? "", session.user.fullNameEn, locale),
    tenantName: localize(session.user.tenantName ?? "", session.user.tenantNameEn, locale),
    userSessionId: session.user.sessionId ?? "",
  };
}

export async function requireRole(...roles: UserRole[]): Promise<RequestContext> {
  const ctx = await getRequestContext();
  if (!ctx) {
    const tErrors = await getTranslations("Common.errors");
    throw new AuthError("UNAUTHENTICATED", tErrors("notAuthenticated"));
  }
  if (!roles.includes(ctx.role)) {
    const tErrors = await getTranslations("Common.errors");
    throw new AuthError("FORBIDDEN", tErrors("notAuthorizedResource"));
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
