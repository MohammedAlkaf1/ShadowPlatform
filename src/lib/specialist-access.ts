import { notFound } from "next/navigation";
import type { RequestContext } from "./session";
import { getTenantScopedPrisma } from "./tenant-db";

/**
 * Enforces the core specialist visibility rule: a specialist may only ever
 * open a student's record if an admin has manually created a
 * SpecialistAssignment linking them. Admins bypass this (university-wide
 * access). Anyone else calling this (student/faculty) is rejected by the
 * caller's own role check before this ever runs.
 *
 * Renders a 404 rather than a 403 on failure so a specialist can't probe for
 * the existence of student records outside their caseload.
 */
export async function assertSpecialistAssigned(ctx: RequestContext, studentProfileId: string): Promise<void> {
  if (ctx.role === "admin") return;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const assignment = await db.specialistAssignment.findFirst({
    where: { specialistUserId: ctx.userId, studentProfileId },
  });

  if (!assignment) {
    notFound();
  }
}
