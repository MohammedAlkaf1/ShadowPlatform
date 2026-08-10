"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { TOOL_CODES } from "@/lib/tool-codes";
import { z } from "zod";

// `.guid()`, not `.uuid()`: Zod's `.uuid()` enforces the RFC 4122
// version/variant nibbles (e.g. rejects an id whose 3rd group doesn't
// start with 1-8), which real Prisma-generated v4 ids always satisfy but
// this project's seed script's intentionally-readable placeholder ids
// (e.g. "00000000-0000-0000-0000-0000000a5501") do not. Postgres's own
// uuid column has no such restriction and already stores these ids fine
// — `.uuid()` here was strictly more restrictive than the actual data
// model, and was the real cause of "بيانات غير صالحة" when submitting
// against seeded records. `.guid()` checks the same 8-4-4-4-12 hex shape
// without the version/variant constraint.
const savePlanSchema = z.object({
  studentProfileId: z.string().guid(),
  assessmentId: z.string().guid(),
  enabledToolCodes: z.array(z.enum(TOOL_CODES)),
});

export interface PlanResult {
  ok: boolean;
  error?: string;
}

/** Creates the plan (as draft) if it doesn't exist yet, and syncs tool activations. */
export async function saveSupportPlan(input: unknown): Promise<PlanResult> {
  const ctx = await requireRole("specialist", "admin");
  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  const { studentProfileId, assessmentId, enabledToolCodes } = parsed.data;
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const assessment = await db.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment || assessment.studentProfileId !== studentProfileId) {
    return { ok: false, error: "لم يتم العثور على التقييم" };
  }

  let plan = await db.supportPlan.findFirst({
    where: { assessmentId },
  });

  if (!plan) {
    plan = await db.supportPlan.create({
      data: {
        tenantId: ctx.tenantId,
        studentProfileId,
        assessmentId,
        status: "draft",
      },
    });
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "create_support_plan",
      resourceType: "SupportPlan",
      resourceId: plan.id,
      targetStudentProfileId: studentProfileId,
    });
  }

  if (plan.status === "approved") {
    return { ok: false, error: "لا يمكن تعديل الأدوات بعد اعتماد الخطة. يمكنك مراجعة المستوى بدلاً من ذلك." };
  }

  // Sync tool activations: enable the selected set, disable the rest.
  for (const code of TOOL_CODES) {
    const enabled = enabledToolCodes.includes(code);
    await db.toolActivation.upsert({
      where: { supportPlanId_toolCode: { supportPlanId: plan.id, toolCode: code } },
      update: { enabled },
      create: { supportPlanId: plan.id, toolCode: code, enabled },
    });
  }

  revalidatePath(`/specialist/students/${studentProfileId}/plan`);
  return { ok: true };
}

export async function approveSupportPlan(planId: string, studentProfileId: string): Promise<PlanResult> {
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plan = await db.supportPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.studentProfileId !== studentProfileId) {
    return { ok: false, error: "لم يتم العثور على الخطة" };
  }

  await db.supportPlan.update({
    where: { id: planId },
    data: {
      status: "approved",
      approvedByUserId: ctx.userId,
      approvedAt: new Date(),
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  });

  await db.studentProfile.update({
    where: { id: studentProfileId },
    data: { requestStatus: "approved" },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "approve_support_plan",
    resourceType: "SupportPlan",
    resourceId: planId,
    targetStudentProfileId: studentProfileId,
  });

  revalidatePath(`/specialist/students/${studentProfileId}/plan`);
  revalidatePath(`/student/status`);
  return { ok: true };
}

// See the comment on savePlanSchema above: `.guid()` not `.uuid()`.
const reviseLevelSchema = z.object({
  studentProfileId: z.string().guid(),
  supportPlanId: z.string().guid(),
  newSupportLevelId: z.string().guid(),
  reason: z.string().min(5),
});

export async function reviseSupportLevel(input: unknown): Promise<PlanResult> {
  const ctx = await requireRole("specialist", "admin");
  const parsed = reviseLevelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "بيانات غير صالحة" };
  }
  const { studentProfileId, supportPlanId, newSupportLevelId, reason } = parsed.data;
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plan = await db.supportPlan.findUnique({ where: { id: supportPlanId } });
  if (!plan || plan.studentProfileId !== studentProfileId) {
    return { ok: false, error: "لم يتم العثور على الخطة" };
  }

  await db.planRevision.create({
    data: {
      supportPlanId,
      revisedByUserId: ctx.userId,
      newSupportLevelId,
      reason,
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "revise_support_plan",
    resourceType: "PlanRevision",
    resourceId: supportPlanId,
    targetStudentProfileId: studentProfileId,
  });

  revalidatePath(`/specialist/students/${studentProfileId}/plan`);
  return { ok: true };
}
