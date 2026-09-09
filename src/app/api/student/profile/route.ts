import { NextResponse } from "next/server";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { computeAdaptationDirectives, defaultAdaptationDirectives, type CategoryCode } from "@/lib/adaptation";

/**
 * GET /api/student/profile
 *
 * JUDGMENT CALL (flagged for the user per the task spec): the web UI never
 * shows a student their own classification/category or support level, by
 * design — students should not self-diagnose or fixate on a label, and the
 * level is meant to be reduced over time by the specialist based on need.
 * We apply that SAME rule to this API: it returns only basic profile fields,
 * the list of enabled tool codes, and — as of Phase 3 — a set of ready-made
 * "adaptation directives" computed server-side from the student's category
 * and support level (see src/lib/adaptation.ts). It NEVER returns the raw
 * category/condition/supportLevel themselves, even though the mobile app
 * could plausibly want that to render richer UI: the directives ARE the
 * richer UI info, already translated into opaque, non-diagnostic values
 * (font sizes, alert thresholds, text styles) so the app never has to see —
 * or reconstruct — the underlying classification.
 */
export async function GET(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
    include: { user: { select: { fullName: true, fullNameEn: true } } },
  });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  const approvedPlan = await db.supportPlan.findFirst({
    where: { studentProfileId: studentProfile.id, status: "approved" },
    orderBy: { approvedAt: "desc" },
    include: {
      toolActivations: { where: { enabled: true } },
      assessment: {
        include: {
          condition: { include: { category: true } },
          supportLevel: true,
        },
      },
    },
  });

  const adaptationDirectives = approvedPlan
    ? computeAdaptationDirectives(
        approvedPlan.assessment.condition.category.code as CategoryCode,
        approvedPlan.assessment.supportLevel.order as 1 | 2 | 3
      )
    : defaultAdaptationDirectives();

  return NextResponse.json({
    fullName: studentProfile.user.fullName,
    fullNameEn: studentProfile.user.fullNameEn,
    studentNumber: studentProfile.studentNumber,
    major: studentProfile.major,
    academicStage: studentProfile.academicStage,
    phone: studentProfile.phone,
    requestStatus: studentProfile.requestStatus,
    verified: studentProfile.verified,
    enabledTools: approvedPlan?.toolActivations.map((t) => t.toolCode) ?? [],
    adaptationDirectives,
  });
}
