import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import type { RequestContext } from "./session";

/**
 * Server-component-level guard, used at the top of each role's layout.tsx.
 * This is defense-in-depth on top of middleware.ts — belt and suspenders,
 * since a layout could theoretically be reached in ways middleware's
 * matcher doesn't anticipate (e.g. future route groups).
 *
 * userEmail/tenantName come straight off the session (auth.ts's jwt/session
 * callbacks populate them once, at login) — NOT from a fresh
 * user.findUnique/tenant.findUnique here. This function runs on every
 * single authenticated page navigation (it's called at the top of every
 * role layout.tsx, which re-executes per navigation), so those would have
 * been two avoidable DB round trips on every navigation just to display an
 * email and a tenant name in the sidebar. See the comment in
 * src/auth.ts's authorize() for where this data actually gets fetched
 * (once, at login).
 */
export async function requireRolePage(
  ...roles: UserRole[]
): Promise<RequestContext & { userEmail: string; tenantName: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.tenantId || !session.user.role) {
    redirect("/login");
  }
  const { id: userId, tenantId, role, tenantName } = session.user;
  if (!roles.includes(role) && role !== "admin") {
    redirect("/unauthorized");
  }

  return {
    userId,
    tenantId,
    role,
    userEmail: session.user.email ?? "",
    tenantName: tenantName ?? "",
  };
}
