"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { createUserSchema } from "@/lib/validation";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const { email, password, role } = parsed.data;
  const emailLower = email.toLowerCase();

  const db = getTenantScopedPrisma(ctx.tenantId);
  const existing = await db.user.findFirst({ where: { email: emailLower } });
  if (existing) {
    return { ok: false, error: "يوجد مستخدم بهذا البريد الإلكتروني مسبقاً" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { tenantId: ctx.tenantId, email: emailLower, passwordHash, role, active: true },
    });
    if (role === "student") {
      await tx.studentProfile.create({
        data: {
          tenantId: ctx.tenantId,
          userId: user.id,
          studentNumber: "",
          major: "",
          academicStage: "",
          phone: "",
          requestStatus: "pending",
          verified: true, // admin-created accounts are considered verified enrollment
        },
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "create_user",
    resourceType: "User",
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["student", "faculty", "specialist", "admin"]),
});

export async function updateUserRole(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };

  const db = getTenantScopedPrisma(ctx.tenantId);
  await db.user.update({ where: { id: parsed.data.userId }, data: { role: parsed.data.role as UserRole } });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update_user",
    resourceType: "User",
    resourceId: parsed.data.userId,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Toggles a user's active flag. When deactivating a STUDENT user, this
 * cascades a SOFT delete (never a hard delete) to their StudentProfile and
 * marks any of their SupportPlans as no longer active (status -> expired) —
 * Assessment rows are left untouched as an immutable historical record since
 * the schema has no "active" concept for them. An AuditLog row records that
 * the deactivation occurred, deliberately without any sensitive content.
 */
export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);

  const user = await db.user.findUnique({ where: { id: userId }, include: { studentProfile: true } });
  if (!user) return { ok: false, error: "المستخدم غير موجود" };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { active, deletedAt: active ? null : new Date() },
    });

    if (!active && user.role === "student" && user.studentProfile) {
      await tx.studentProfile.update({
        where: { id: user.studentProfile.id },
        data: { deletedAt: new Date() },
      });
      await tx.supportPlan.updateMany({
        where: { studentProfileId: user.studentProfile.id, status: { not: "expired" } },
        data: { status: "expired" },
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: active ? "update_user" : "soft_delete_student",
    resourceType: "User",
    resourceId: userId,
    targetStudentProfileId: user.studentProfile?.id ?? null,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}

const assignSpecialistSchema = z.object({
  specialistUserId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
});

export async function assignSpecialist(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const parsed = assignSpecialistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };

  const db = getTenantScopedPrisma(ctx.tenantId);
  const { specialistUserId, studentProfileId } = parsed.data;

  const specialist = await db.user.findUnique({ where: { id: specialistUserId } });
  if (!specialist || specialist.role !== "specialist") {
    return { ok: false, error: "المستخدم المحدد ليس مختصاً" };
  }

  await db.specialistAssignment.upsert({
    where: { specialistUserId_studentProfileId: { specialistUserId, studentProfileId } },
    update: {},
    create: { tenantId: ctx.tenantId, specialistUserId, studentProfileId, assignedByUserId: ctx.userId },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "assign_specialist",
    resourceType: "SpecialistAssignment",
    targetStudentProfileId: studentProfileId,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
