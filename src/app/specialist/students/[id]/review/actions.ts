"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { assessmentSchema } from "@/lib/validation";
import { TOOL_CODES } from "@/lib/tool-codes";
import { z } from "zod";

// Batch 3: the assess and plan screens merged into one "مراجعة وثيقة"
// review screen (see page.tsx / review-form.tsx). The underlying writes
// below are UNCHANGED from the old src/app/specialist/students/[id]/assess
// /actions.ts and .../plan/actions.ts — same validation, same audit action
// names, same tenant/assignment scoping — only moved into one file since
// they're now called from one combined form instead of two separate pages.
// An Assessment row and a SupportPlan row are still two separate real
// writes; the UI just no longer forces a page navigation between them.

function revalidateReviewPaths(studentProfileId: string) {
  revalidatePath(`/specialist/students/${studentProfileId}/review`);
  revalidatePath(`/specialist/students/${studentProfileId}`);
  revalidatePath(`/specialist/queue`);
}

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
}

export async function createAssessment(formData: unknown): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = assessmentSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { studentProfileId, conditionId, supportLevelId, notes } = parsed.data;

  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const student = await db.studentProfile.findUnique({ where: { id: studentProfileId } });
  if (!student) {
    return { ok: false, error: tErrors("studentNotFound") };
  }

  await db.assessment.create({
    data: {
      tenantId: ctx.tenantId,
      studentProfileId,
      specialistUserId: ctx.userId,
      conditionId,
      supportLevelId,
      notes,
      assessedAt: new Date(),
    },
  });

  if (student.requestStatus !== "approved") {
    await db.studentProfile.update({
      where: { id: studentProfileId },
      data: { requestStatus: "under_review" },
    });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create_assessment",
    resourceType: "Assessment",
    targetStudentProfileId: studentProfileId,
  });

  revalidateReviewPaths(studentProfileId);
  return { ok: true };
}

// `.guid()`, not `.uuid()` — see the original comment in the old plan/
// actions.ts: Zod's `.uuid()` rejects this project's intentionally-readable
// seeded placeholder ids, which real Prisma-generated ids never hit but the
// seed script's ids do.
const savePlanSchema = z.object({
  studentProfileId: z.string().guid(),
  assessmentId: z.string().guid(),
  enabledToolCodes: z.array(z.enum(TOOL_CODES)),
});

/** Creates the plan (as draft) if it doesn't exist yet, and syncs tool activations. */
export async function saveSupportPlan(input: unknown): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = savePlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { studentProfileId, assessmentId, enabledToolCodes } = parsed.data;
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const assessment = await db.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment || assessment.studentProfileId !== studentProfileId) {
    return { ok: false, error: tErrors("assessmentNotFound") };
  }

  let plan = await db.supportPlan.findFirst({ where: { assessmentId } });

  if (!plan) {
    plan = await db.supportPlan.create({
      data: { tenantId: ctx.tenantId, studentProfileId, assessmentId, status: "draft" },
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
    return { ok: false, error: tErrors("planLockedTools") };
  }

  for (const code of TOOL_CODES) {
    const enabled = enabledToolCodes.includes(code);
    await db.toolActivation.upsert({
      where: { supportPlanId_toolCode: { supportPlanId: plan.id, toolCode: code } },
      update: { enabled },
      create: { supportPlanId: plan.id, toolCode: code, enabled },
    });
  }

  revalidateReviewPaths(studentProfileId);
  return { ok: true };
}

const planItemConfigSchema = z.object({
  planId: z.string().guid(),
  toolCode: z.enum(TOOL_CODES),
  studentProfileId: z.string().guid(),
  courses: z.string().max(200).optional(),
  startDate: z.string().max(40).optional(),
  visible: z.string().max(40).optional(),
});

/**
 * Persists the per-plan-item "target courses / start date / visibility"
 * fields the design reference shows on each support-plan card, via the
 * pencil-edit button — real data stored in ToolActivation.config (the one
 * schema field built for exactly this: arbitrary per-tool JSON), not
 * invented columns.
 */
export async function updatePlanItemConfig(input: unknown): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = planItemConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { planId, toolCode, studentProfileId, courses, startDate, visible } = parsed.data;
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plan = await db.supportPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.studentProfileId !== studentProfileId) {
    return { ok: false, error: tErrors("planNotFound") };
  }
  if (plan.status === "approved") {
    return { ok: false, error: tErrors("planLockedItems") };
  }

  await db.toolActivation.update({
    where: { supportPlanId_toolCode: { supportPlanId: planId, toolCode } },
    data: { config: { courses: courses ?? null, startDate: startDate ?? null, visible: visible ?? null } },
  });

  revalidateReviewPaths(studentProfileId);
  return { ok: true };
}

export async function approveSupportPlan(planId: string, studentProfileId: string): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);
  const tErrors = await getTranslations("Common.errors");

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plan = await db.supportPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.studentProfileId !== studentProfileId) {
    return { ok: false, error: tErrors("planNotFound") };
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

  revalidateReviewPaths(studentProfileId);
  revalidatePath(`/student/status`);
  return { ok: true };
}

const reviseLevelSchema = z.object({
  studentProfileId: z.string().guid(),
  supportPlanId: z.string().guid(),
  newSupportLevelId: z.string().guid(),
  reason: z.string().min(5),
});

export async function reviseSupportLevel(input: unknown): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = reviseLevelSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { studentProfileId, supportPlanId, newSupportLevelId, reason } = parsed.data;
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const plan = await db.supportPlan.findUnique({ where: { id: supportPlanId } });
  if (!plan || plan.studentProfileId !== studentProfileId) {
    return { ok: false, error: tErrors("planNotFound") };
  }

  await db.planRevision.create({
    data: { supportPlanId, revisedByUserId: ctx.userId, newSupportLevelId, reason },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "revise_support_plan",
    resourceType: "PlanRevision",
    resourceId: supportPlanId,
    targetStudentProfileId: studentProfileId,
  });

  revalidateReviewPaths(studentProfileId);
  return { ok: true };
}

/**
 * NEW in batch 3 — the mockup's "أعدها للطالب" (send back to student)
 * button had no wired action even in the mockup's own toy state model (no
 * onClick at all), so there was no existing real behavior to move here.
 * SupportPlanStatus has no "rejected"/"returned" value (draft/approved/
 * expired only — see prisma/schema.prisma), so this does NOT touch
 * SupportPlan; it sets the request itself back to the existing
 * RequestStatus.rejected value (already a valid, pre-existing enum member,
 * already used for filtering on admin/stats) and logs a dedicated audit
 * action. Judgment call — flagged in the batch report since it's a new
 * mutation, not just a moved one.
 */
export async function returnRequestToStudent(studentProfileId: string): Promise<ReviewActionResult> {
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);
  const tErrors = await getTranslations("Common.errors");

  const db = getTenantScopedPrisma(ctx.tenantId);
  const student = await db.studentProfile.findUnique({ where: { id: studentProfileId } });
  if (!student) {
    return { ok: false, error: tErrors("studentNotFound") };
  }

  await db.studentProfile.update({
    where: { id: studentProfileId },
    data: { requestStatus: "rejected" },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "return_request_to_student",
    resourceType: "StudentProfile",
    resourceId: studentProfileId,
    targetStudentProfileId: studentProfileId,
  });

  revalidateReviewPaths(studentProfileId);
  revalidatePath(`/student/status`);
  return { ok: true };
}
