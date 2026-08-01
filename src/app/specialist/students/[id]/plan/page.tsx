import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanForm } from "./plan-form";
import type { ToolCodeValue } from "@/lib/tool-codes";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  expired: "منتهية",
};

export default async function StudentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true } } },
  });
  if (!student) notFound();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_support_plan",
    resourceType: "SupportPlan",
    targetStudentProfileId: studentProfileId,
  });

  const latestAssessment = await db.assessment.findFirst({
    where: { studentProfileId },
    orderBy: { assessedAt: "desc" },
    include: { condition: { include: { category: true } }, supportLevel: true },
  });

  const supportLevels = await db.supportLevel.findMany({ orderBy: { order: "asc" } });

  if (!latestAssessment) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-primary">خطة الدعم</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            لا يمكن إنشاء خطة دعم قبل إجراء تقييم للطالب أولاً.
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = await db.supportPlan.findFirst({
    where: { assessmentId: latestAssessment.id },
    include: { toolActivations: true, planRevisions: { include: { newSupportLevel: true }, orderBy: { createdAt: "desc" } } },
  });

  const initialEnabledCodes = (plan?.toolActivations.filter((t) => t.enabled).map((t) => t.toolCode) ??
    []) as ToolCodeValue[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">خطة الدعم</h1>
        <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
          {student.user.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أساس الخطة (آخر تقييم)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {latestAssessment.condition.category.nameAr} — {latestAssessment.condition.nameAr}
          </p>
          <p className="text-muted-foreground">مستوى الدعم الأساسي: {latestAssessment.supportLevel.nameAr}</p>
          {plan && (
            <Badge variant="secondary" className="mt-2">
              حالة الخطة: {PLAN_STATUS_LABELS[plan.status]}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأدوات المفعّلة في التطبيق</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanForm
            studentProfileId={studentProfileId}
            assessmentId={latestAssessment.id}
            planId={plan?.id ?? null}
            planStatus={plan?.status ?? null}
            initialEnabledCodes={initialEnabledCodes}
            supportLevels={supportLevels}
          />
        </CardContent>
      </Card>

      {plan && plan.planRevisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">سجل مراجعات المستوى</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {plan.planRevisions.map((rev) => (
                <li key={rev.id} className="rounded-md border border-border p-3">
                  <p className="font-medium">المستوى الجديد: {rev.newSupportLevel.nameAr}</p>
                  <p className="text-muted-foreground">{rev.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {rev.createdAt.toLocaleString("ar-SA")}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
