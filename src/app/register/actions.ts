"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { studentRegisterSchema } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

export interface RegisterResult {
  ok: boolean;
  error?: string;
}

// 5 accounts / hour per IP — self-registration has no email-verification
// step gating it (see this file's own doc comment on `verified`), so this
// is the only thing stopping automated bulk account creation.
const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/**
 * Student self-registration.
 *
 * Judgment call on tenant resolution + `verified`: with self-signup, we
 * resolve the tenant by matching the email's domain against
 * Tenant.emailDomain (only tenants with selfSignupEnabled=true are
 * eligible). A domain match means the student's institutional email proves
 * they belong to that university, so `verified` is set true. If no tenant's
 * domain matches, we still let self-signup succeed against the "closest"
 * open tenant (this demo only seeds one), but mark `verified=false` — real
 * enrollment then has to be confirmed out-of-band (e.g. by an admin via a
 * real tenant agreement), which the spec calls out explicitly. That distinct
 * "manually verified later" path is not built as a page in Phase 1 beyond
 * the boolean column and admin's ability to see/edit users.
 */
export async function registerStudent(formData: unknown): Promise<RegisterResult> {
  const tErrors = await getTranslations("Common.errors");

  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ip = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? "unknown") : (headerStore.get("x-real-ip") ?? "unknown");
  const rateLimit = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return { ok: false, error: tErrors("tooManyRequests") };
  }

  const parsed = studentRegisterSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: tErrors("invalidData") };
  }
  const data = parsed.data;
  const emailLower = data.email.toLowerCase();
  const domain = emailLower.split("@")[1];

  const domainMatchedTenant = await prisma.tenant.findFirst({
    where: { active: true, selfSignupEnabled: true, emailDomain: domain },
  });
  const fallbackTenant = domainMatchedTenant
    ? null
    : await prisma.tenant.findFirst({ where: { active: true, selfSignupEnabled: true } });

  const tenant = domainMatchedTenant ?? fallbackTenant;
  if (!tenant) {
    return { ok: false, error: tErrors("selfSignupDisabled") };
  }

  const existing = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: emailLower },
  });
  if (existing) {
    return { ok: false, error: tErrors("accountAlreadyExists") };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: emailLower,
        fullName: data.fullName.trim(),
        passwordHash,
        role: "student",
        active: true,
      },
    });

    await tx.studentProfile.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        studentNumber: data.studentNumber,
        major: data.major,
        academicStage: data.academicStage,
        phone: data.phone,
        requestStatus: "pending",
        verified: Boolean(domainMatchedTenant),
      },
    });
  });

  return { ok: true };
}
