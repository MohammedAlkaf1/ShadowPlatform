import { getTenantScopedPrisma } from "./tenant-db";
import { computeAdaptationDirectives, type AdaptationDirectives, type CategoryCode, type SupportLevelOrder } from "./adaptation";
import type { ToolCodeValue } from "./tool-codes";

export interface StudentAiContext {
  directives: AdaptationDirectives;
  categoryCode: CategoryCode;
  supportLevelOrder: SupportLevelOrder;
}

/**
 * Server-side authorization + personalization lookup for the migrated
 * student AI endpoints (visual-assistance, learning-support, and the three
 * deaf-mode helpers).
 *
 * Two things happen here, both required by the security migration:
 *   1. AUTHORIZATION: the student's own approved SupportPlan must have
 *      `requiredToolCode` enabled (VISUAL_MODE / LEARNING_MODE / DEAF_MODE —
 *      see tool-codes.ts), mirroring the same gate the Flutter app already
 *      applies client-side to decide which mode screens to show. The
 *      previous client-only implementation trusted the app's own local
 *      state for this; the server must independently verify it, since the
 *      client can no longer be trusted to gate access to a feature that now
 *      costs the platform real Gemini spend per call. Returns `null` if not
 *      authorized — callers must respond 403.
 *   2. PERSONALIZATION: derives the same category/support-level directives
 *      GET /api/student/profile already computes, for the Gemini prompt
 *      builders in ai.ts. The raw category/support level never leave this
 *      function — only the opaque `AdaptationDirectives` (already the
 *      platform's existing non-diagnostic contract) and the category code
 *      itself (needed only to pick which fixed label string ai.ts's prompt
 *      builders interpolate — never returned to the client).
 */
export async function authorizeStudentAiFeature(
  tenantId: string,
  userId: string,
  requiredToolCode: ToolCodeValue
): Promise<StudentAiContext | null> {
  const db = getTenantScopedPrisma(tenantId);

  const studentProfile = await db.studentProfile.findUnique({ where: { userId } });
  if (!studentProfile) return null;

  const approvedPlan = await db.supportPlan.findFirst({
    where: { studentProfileId: studentProfile.id, status: "approved" },
    orderBy: { approvedAt: "desc" },
    include: {
      toolActivations: { where: { enabled: true } },
      assessment: { include: { condition: { include: { category: true } }, supportLevel: true } },
    },
  });
  if (!approvedPlan) return null;

  const hasTool = approvedPlan.toolActivations.some((t) => t.toolCode === requiredToolCode);
  if (!hasTool) return null;

  const categoryCode = approvedPlan.assessment.condition.category.code as CategoryCode;
  const supportLevelOrder = approvedPlan.assessment.supportLevel.order as SupportLevelOrder;
  const directives = computeAdaptationDirectives(categoryCode, supportLevelOrder);
  return { directives, categoryCode, supportLevelOrder };
}
