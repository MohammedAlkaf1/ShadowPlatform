"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { createUserSchema, updateUserProfileSchema } from "@/lib/validation";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { email, fullName, fullNameEn, password, role, studentNumber } = parsed.data;
  const emailLower = email.toLowerCase();

  const db = getTenantScopedPrisma(ctx.tenantId);
  const existing = await db.user.findFirst({ where: { email: emailLower } });
  if (existing) {
    return { ok: false, error: tErrors("emailAlreadyExists") };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: ctx.tenantId,
        email: emailLower,
        fullName: fullName.trim(),
        fullNameEn: fullNameEn && fullNameEn.length > 0 ? fullNameEn : null,
        passwordHash,
        role,
        active: true,
      },
    });
    if (role === "student") {
      await tx.studentProfile.create({
        data: {
          tenantId: ctx.tenantId,
          userId: user.id,
          studentNumber: studentNumber?.trim() ?? "",
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

  revalidatePath("/admin/user-management");
  return { ok: true };
}

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["student", "faculty", "specialist", "admin"]),
});

export async function updateUserRole(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: tErrors("invalidData") };

  const db = getTenantScopedPrisma(ctx.tenantId);
  // Bump tokenVersion alongside the role change: getMobileRequestContext
  // already re-derives role fresh from the DB on every request (never
  // trusts the JWT's own role claim), so this isn't needed for the role
  // change to take effect — it's defense-in-depth so any outstanding token
  // minted under the old role is forced through a fresh login/refresh
  // rather than silently continuing to work.
  await db.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role as UserRole, tokenVersion: { increment: 1 } },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update_user",
    resourceType: "User",
    resourceId: parsed.data.userId,
  });

  revalidatePath("/admin/user-management");
  return { ok: true };
}

/**
 * Admin "Edit user" action — updates the fields the edit dialog exposes
 * (ar/en name, email, role, student number). Same ar/en pairing and
 * email-uniqueness handling as createUser; role changes bump tokenVersion
 * for the same defense-in-depth reason as updateUserRole above. Does not
 * touch password, active/deletedAt, or any documents/assessments.
 */
export async function updateUserProfile(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = updateUserProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const { userId, email, fullName, fullNameEn, role, studentNumber } = parsed.data;
  const emailLower = email.toLowerCase();

  const db = getTenantScopedPrisma(ctx.tenantId);
  const user = await db.user.findUnique({ where: { id: userId }, include: { studentProfile: true } });
  if (!user) return { ok: false, error: tErrors("userNotFound") };

  const emailConflict = await db.user.findFirst({ where: { email: emailLower, id: { not: userId } } });
  if (emailConflict) return { ok: false, error: tErrors("emailAlreadyExists") };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: emailLower,
        fullName: fullName.trim(),
        fullNameEn: fullNameEn && fullNameEn.length > 0 ? fullNameEn : null,
        role,
        tokenVersion: { increment: 1 },
      },
    });

    if (role === "student") {
      if (user.studentProfile) {
        await tx.studentProfile.update({
          where: { id: user.studentProfile.id },
          data: { studentNumber: studentNumber?.trim() ?? user.studentProfile.studentNumber },
        });
      } else {
        await tx.studentProfile.create({
          data: {
            tenantId: ctx.tenantId,
            userId,
            studentNumber: studentNumber?.trim() ?? "",
            major: "",
            academicStage: "",
            phone: "",
            requestStatus: "pending",
            verified: true,
          },
        });
      }
    }
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "update_user",
    resourceType: "User",
    resourceId: userId,
  });

  revalidatePath("/admin/user-management");
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
  const tErrors = await getTranslations("Common.errors");
  const db = getTenantScopedPrisma(ctx.tenantId);

  const user = await db.user.findUnique({ where: { id: userId }, include: { studentProfile: true } });
  if (!user) return { ok: false, error: tErrors("userNotFound") };

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // Same defense-in-depth reasoning as updateUserRole above — the
      // `active`/`deletedAt` check in getMobileRequestContext already blocks
      // a disabled account's tokens immediately; bumping tokenVersion too
      // means re-enabling the account later doesn't silently resurrect any
      // pre-disablement token that happened to still be unexpired.
      data: { active, deletedAt: active ? null : new Date(), tokenVersion: { increment: 1 } },
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

  revalidatePath("/admin/user-management");
  return { ok: true };
}

const assignSpecialistSchema = z.object({
  specialistUserId: z.string().uuid(),
  studentProfileId: z.string().uuid(),
});

export async function assignSpecialist(input: unknown): Promise<ActionResult> {
  const ctx = await requireRole("admin");
  const tErrors = await getTranslations("Common.errors");
  const parsed = assignSpecialistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: tErrors("invalidData") };

  const db = getTenantScopedPrisma(ctx.tenantId);
  const { specialistUserId, studentProfileId } = parsed.data;

  const specialist = await db.user.findUnique({ where: { id: specialistUserId } });
  if (!specialist || specialist.role !== "specialist") {
    return { ok: false, error: tErrors("userNotSpecialist") };
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
