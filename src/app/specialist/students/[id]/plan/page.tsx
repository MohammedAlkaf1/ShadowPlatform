import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanForm } from "./plan-form";
import type { ToolCodeValue } from "@/lib/tool-codes";

export default async function StudentPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistPlan");
  const tPlanStatus = await getTranslations("Common.planStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();

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

  const supportLevelsRaw = await db.supportLevel.findMany({ orderBy: { order: "asc" } });
  const supportLevels = supportLevelsRaw.map((l) => ({
    id: l.id,
    name: tSupportLevel(String(l.order)),
    order: l.order,
  }));

  if (!latestAssessment) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("cannotCreateYet")}
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
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
          {student.user.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("basisTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {locale === "en" ? latestAssessment.condition.category.nameEn : latestAssessment.condition.category.nameAr} —{" "}
            {locale === "en" ? latestAssessment.condition.nameEn : latestAssessment.condition.nameAr}
          </p>
          <p className="text-muted-foreground">
            {t("baseSupportLevel")}: {tSupportLevel(String(latestAssessment.supportLevel.order))}
          </p>
          {plan && (
            <Badge variant="secondary" className="mt-2">
              {t("planStatusLabel")}: {tPlanStatus(plan.status)}
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("toolsTitle")}</CardTitle>
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
            <CardTitle className="text-base">{t("revisionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {plan.planRevisions.map((rev) => (
                <li key={rev.id} className="rounded-md border border-border p-3">
                  <p className="font-medium">
                    {t("newLevelPrefix")}: {tSupportLevel(String(rev.newSupportLevel.order))}
                  </p>
                  <p className="text-muted-foreground">{rev.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {formatDateTime(rev.createdAt, locale)}
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
