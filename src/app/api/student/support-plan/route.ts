import { NextResponse } from "next/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/student/support-plan — approved plan + enabled tools for the
 * calling student. Same withholding rule as /api/student/profile: no
 * category/condition/supportLevel/notes, ever.
 */
export async function GET(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const plan = await db.supportPlan.findFirst({
    where: { studentProfileId: studentProfile.id, status: "approved" },
    orderBy: { approvedAt: "desc" },
    include: { toolActivations: true },
  });

  if (!plan) {
    return NextResponse.json({ hasApprovedPlan: false, enabledTools: [] });
  }

  return NextResponse.json({
    hasApprovedPlan: true,
    approvedAt: plan.approvedAt,
    expiresAt: plan.expiresAt,
    enabledTools: plan.toolActivations.filter((t) => t.enabled).map((t) => ({ toolCode: t.toolCode, config: t.config })),
  });
}
