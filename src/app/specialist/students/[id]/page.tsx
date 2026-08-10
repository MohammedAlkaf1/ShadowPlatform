import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistStudentDetail");
  const tPlanStatus = await getTranslations("Common.planStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const locale = await getLocale();

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true } } },
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

  const [assessments, supportPlans, usageEvents, documents] = await Promise.all([
    db.assessment.findMany({
      where: { studentProfileId },
      include: { condition: { include: { category: true } }, supportLevel: true },
      orderBy: { assessedAt: "desc" },
    }),
    db.supportPlan.findMany({
      where: { studentProfileId },
      orderBy: { createdAt: "desc" },
    }),
    db.usageEvent.findMany({
      where: { studentProfileId },
      select: { eventType: true },
    }),
    // Same download route the student's own /student/documents page links
    // to for viewing purposes is NOT reused here — specialists go through
    // the specialist-only GET /api/documents/:id route below, which is
    // separately access-gated by assertSpecialistAssigned/SpecialistAssignment
    // and audit-logs every view. This page previously queried assessments/
    // supportPlans/usageEvents/planRevisions but never Document at all, so
    // uploaded documents were invisible here even when the specialist was
    // correctly assigned to the student.
    db.document.findMany({
      where: { studentProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalFilename: true, createdAt: true, status: true },
    }),
  ]);

  // PlanRevision has no tenantId column (it scopes transitively through its
  // parent SupportPlan, which we've already tenant-scoped above), so this
  // read goes through the base prisma client filtered by the plan ids we
  // already verified belong to this tenant/student.
  const planRevisions = supportPlans.length
    ? await prisma.planRevision.findMany({
        where: { supportPlanId: { in: supportPlans.map((p) => p.id) } },
        include: { newSupportLevel: true, revisedBy: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const usageSummary = usageEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {student.user.email}
          </p>
          <p className="text-sm text-muted-foreground">
            {student.studentNumber} — {student.major} — {student.academicStage}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Navigation links styled as buttons — see the comment in
              specialist/queue/page.tsx for why these use buttonVariants
              directly on <Link> instead of Button's `render` prop. */}
          <Link
            href={`/specialist/students/${studentProfileId}/assess`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("assessButton")}
          </Link>
          <Link href={`/specialist/students/${studentProfileId}/plan`} className={cn(buttonVariants())}>
            {t("planButton")}
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("documentsTitle")} ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableFile")}</TableHead>
                  <TableHead>{t("tableUploadDate")}</TableHead>
                  <TableHead>{t("tableStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="flex items-center gap-2 font-medium">
                      <FileText className="size-4 text-muted-foreground" />
                      {doc.originalFilename}
                    </TableCell>
                    <TableCell dir="ltr" className="text-end text-muted-foreground">
                      {formatDate(doc.createdAt, locale)}
                    </TableCell>
                    <TableCell>{tDocumentStatus(doc.status === "reviewed" ? "reviewed" : "pending")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("assessmentsTitle")} ({assessments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noAssessments")}</p>
          ) : (
            <ul className="space-y-3">
              {assessments.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {locale === "en" ? a.condition.category.nameEn : a.condition.category.nameAr} —{" "}
                    {locale === "en" ? a.condition.nameEn : a.condition.nameAr}
                  </p>
                  <p className="text-muted-foreground">
                    {t("supportLevelLabel")}: {tSupportLevel(String(a.supportLevel.order))}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("plansTitle")} ({supportPlans.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {supportPlans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noPlans")}</p>
          ) : (
            <ul className="space-y-2">
              {supportPlans.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span dir="ltr" className="text-muted-foreground">
                    {formatDateTime(p.createdAt, locale)}
                  </span>
                  <Badge variant="secondary">{tPlanStatus(p.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("revisionsTitle")} ({planRevisions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {planRevisions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noRevisions")}</p>
          ) : (
            <ul className="space-y-3">
              {planRevisions.map((rev) => (
                <li key={rev.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">
                    {t("newLevelLabel")}: {tSupportLevel(String(rev.newSupportLevel.order))}
                  </p>
                  <p className="text-muted-foreground">{rev.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {rev.revisedBy.email} — {formatDateTime(rev.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("usageSummaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(usageSummary).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noUsageData")}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(usageSummary).map(([eventType, count]) => (
                <li
                  key={eventType}
                  className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
                >
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {eventType}
                  </span>
                  <Badge variant="secondary">{count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
