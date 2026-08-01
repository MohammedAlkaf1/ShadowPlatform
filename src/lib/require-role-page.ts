import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { getRequestContext, type RequestContext } from "./session";
import { prisma } from "./prisma";

/**
 * Server-component-level guard, used at the top of each role's layout.tsx.
 * This is defense-in-depth on top of middleware.ts — belt and suspenders,
 * since a layout could theoretically be reached in ways middleware's
 * matcher doesn't anticipate (e.g. future route groups).
 */
export async function requireRolePage(
  ...roles: UserRole[]
): Promise<RequestContext & { userEmail: string; tenantName: string }> {
  const ctx = await getRequestContext();
  if (!ctx) {
    redirect("/login");
  }
  if (!roles.includes(ctx.role) && ctx.role !== "admin") {
    redirect("/unauthorized");
  }

  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
  ]);

  return {
    ...ctx,
    userEmail: user?.email ?? "",
    tenantName: tenant?.name ?? "",
  };
}
