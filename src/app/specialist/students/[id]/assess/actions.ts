"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { assessmentSchema } from "@/lib/validation";

export interface AssessResult {
  ok: boolean;
  error?: string;
}

export async function createAssessment(formData: unknown): Promise<AssessResult> {
  const ctx = await requireRole("specialist", "admin");
  const parsed = assessmentSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const { studentProfileId, conditionId, supportLevelId, notes } = parsed.data;

  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const student = await db.studentProfile.findUnique({ where: { id: studentProfileId } });
  if (!student) {
    return { ok: false, error: "لم يتم العثور على الطالب" };
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

  revalidatePath(`/specialist/students/${studentProfileId}/assess`);
  revalidatePath(`/specialist/students/${studentProfileId}/plan`);

  return { ok: true };
}
