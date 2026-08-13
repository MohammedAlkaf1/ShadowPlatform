import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssessForm } from "./assess-form";

export default async function AssessStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistAssess");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!student) notFound();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_student_profile",
    resourceType: "StudentProfile",
    resourceId: studentProfileId,
    targetStudentProfileId: studentProfileId,
  });

  // Sort order here is a stable, locale-neutral query detail (kept as-is per
  // scope constraints — not a display-string change), the display labels
  // below are what's actually localized.
  const [categoriesRaw, supportLevels, pastAssessments] = await Promise.all([
    db.category.findMany({ include: { conditions: true }, orderBy: { nameAr: "asc" } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
    db.assessment.findMany({
      where: { studentProfileId },
      include: { condition: { include: { category: true } }, supportLevel: true },
      orderBy: { assessedAt: "desc" },
    }),
  ]);

  const categories = categoriesRaw.map((c) => ({
    id: c.id,
    name: locale === "en" ? c.nameEn : c.nameAr,
    conditions: c.conditions.map((cond) => ({
      id: cond.id,
      name: locale === "en" ? cond.nameEn : cond.nameAr,
    })),
  }));
  const levels = supportLevels.map((l) => ({ id: l.id, name: tSupportLevel(String(l.order)), order: l.order }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-base font-semibold text-foreground">{student.user.fullName}</p>
        <p className="text-sm text-muted-foreground" dir="ltr">
          {student.user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          {student.studentNumber} — {student.major}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("newAssessmentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessForm studentProfileId={studentProfileId} categories={categories} supportLevels={levels} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("historyTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {pastAssessments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-3">
              {pastAssessments.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {locale === "en" ? a.condition.category.nameEn : a.condition.category.nameAr} —{" "}
                    {locale === "en" ? a.condition.nameEn : a.condition.nameAr}
                  </p>
                  <p className="text-muted-foreground">
                    {t("supportLevelPrefix")}: {tSupportLevel(String(a.supportLevel.order))}
                  </p>
                  <p className="mt-1 text-foreground">{a.notes}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {formatDateTime(a.assessedAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
