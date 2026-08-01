import { NextResponse } from "next/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

/**
 * GET /api/student/profile
 *
 * JUDGMENT CALL (flagged for the user per the task spec): the web UI never
 * shows a student their own classification/category or support level, by
 * design — students should not self-diagnose or fixate on a label, and the
 * level is meant to be reduced over time by the specialist based on need.
 * We apply that SAME rule to this API: it returns only basic profile fields
 * and the list of enabled tool codes, never category or supportLevel, even
 * though the mobile app could plausibly want that to render richer UI. If
 * the app team decides they genuinely need it to build correct UI, that's a
 * product decision that should be made explicitly (and probably still not
 * exposed as "your diagnosis is X"), not something this endpoint should
 * silently unlock.
 */
export async function GET(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const approvedPlan = await db.supportPlan.findFirst({
    where: { studentProfileId: studentProfile.id, status: "approved" },
    orderBy: { approvedAt: "desc" },
    include: { toolActivations: { where: { enabled: true } } },
  });

  return NextResponse.json({
    studentNumber: studentProfile.studentNumber,
    major: studentProfile.major,
    academicStage: studentProfile.academicStage,
    phone: studentProfile.phone,
    requestStatus: studentProfile.requestStatus,
    verified: studentProfile.verified,
    enabledTools: approvedPlan?.toolActivations.map((t) => t.toolCode) ?? [],
  });
}
