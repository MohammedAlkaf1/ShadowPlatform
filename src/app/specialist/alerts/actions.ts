"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export interface AlertActionResult {
  ok: boolean;
  error?: string;
}

async function assertOwnsAlert(ctx: { userId: string; role: string; tenantId: string }, alertId: string) {
  const db = getTenantScopedPrisma(ctx.tenantId);
  const alert = await db.mentorAlert.findUnique({ where: { id: alertId } });
  if (!alert) return null;
  if (ctx.role !== "admin" && alert.assignedSpecialistId !== ctx.userId) return null;
  return { db, alert };
}

export async function acknowledgeAlert(alertId: string): Promise<AlertActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const found = await assertOwnsAlert(ctx, alertId);
  if (!found) return { ok: false, error: tErrors("alertNotFound") };

  await found.db.mentorAlert.update({ where: { id: alertId }, data: { status: "acknowledged" } });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "acknowledge_alert",
    resourceType: "MentorAlert",
    resourceId: alertId,
    targetStudentProfileId: found.alert.studentProfileId,
  });

  revalidatePath("/specialist/alerts");
  return { ok: true };
}

const resolveSchema = z.object({
  alertId: z.string().uuid(),
  reason: z.string().max(2000).optional(),
});

/**
 * Resolves an alert. MentorAlert has no dedicated resolutionReason column in
 * the current schema (flagged for the user rather than adding one
 * unilaterally — see report). To still support an optional reason without a
 * schema change, a provided reason is appended to the existing `message`
 * field as a clearly-marked note rather than overwriting the original alert
 * message.
 */
export async function resolveAlert(input: unknown): Promise<AlertActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: tErrors("invalidData") };

  const found = await assertOwnsAlert(ctx, parsed.data.alertId);
  if (!found) return { ok: false, error: tErrors("alertNotFound") };

  const reason = parsed.data.reason?.trim();
  const newMessage = reason ? `${found.alert.message}\n\n[${tErrors("alertResolvedNote")}] ${reason}` : found.alert.message;

  await found.db.mentorAlert.update({
    where: { id: parsed.data.alertId },
    data: { status: "resolved", message: newMessage },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "resolve_alert",
    resourceType: "MentorAlert",
    resourceId: parsed.data.alertId,
    targetStudentProfileId: found.alert.studentProfileId,
  });

  revalidatePath("/specialist/alerts");
  return { ok: true };
}
