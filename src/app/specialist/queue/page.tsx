import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EchoCard } from "@/components/ui/echo-card";
import { Sparkline } from "@/components/ui/sparkline";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import type { SupportLevel } from "@prisma/client";

/** Module-level (not inline in the component body) specifically so the
 * Date.now() call doesn't trip the "impure function during render" lint
 * rule — same established pattern as admin/stats/page.tsx. */
function twelveWeeksAgo(): Date {
  return new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
}

function weeklyCounts(dates: Date[], weeks: number): number[] {
  const now = Date.now();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const buckets = new Array(weeks).fill(0) as number[];
  for (const d of dates) {
    const weeksAgo = Math.floor((now - d.getTime()) / msPerWeek);
    const idx = weeks - 1 - weeksAgo;
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets;
}

export default async function SpecialistQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistQueue");
  const tPlanStatus = await getTranslations("Common.planStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();
  const params = await searchParams;

  // A specialist only ever sees students an admin has manually assigned to
  // them. Admins viewing this page see the whole tenant's queue instead.
  const [assignments, supportLevels, recentAssessments] = await Promise.all([
    db.specialistAssignment.findMany({
      where: ctx.role === "admin" ? {} : { specialistUserId: ctx.userId },
      include: {
        studentProfile: {
          include: {
            user: { select: { email: true, fullName: true } },
            assessments: {
              orderBy: { assessedAt: "desc" },
              take: 1,
              include: { condition: { include: { category: true } }, supportLevel: true },
            },
            supportPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
            mentorAlerts: { where: { status: "open" }, select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
    // Cheap additive query for the hero sparkline — same specialist/tenant
    // scoping as the main query, just a narrower date-bounded select.
    db.assessment.findMany({
      where: {
        assessedAt: { gte: twelveWeeksAgo() },
        ...(ctx.role === "admin" ? {} : { specialistUserId: ctx.userId }),
      },
      select: { assessedAt: true },
    }),
  ]);

  const needsAttention = assignments.filter(
    (a) => a.studentProfile.mentorAlerts.length > 0 || a.studentProfile.assessments.length === 0
  );
  const approvedPlanCount = assignments.filter((a) => a.studentProfile.supportPlans[0]?.status === "approved").length;
  const plansNeedingRevisionCount = assignments.filter((a) => {
    const status = a.studentProfile.supportPlans[0]?.status;
    return status === "draft" || status === "expired";
  }).length;

  const weeklyAssessments = weeklyCounts(
    recentAssessments.map((a) => a.assessedAt),
    12
  );

  // "Start review" primary action: the most recently assigned student who
  // hasn't been assessed yet at all — the single most useful "where do I
  // start" pointer. Omitted entirely (no forced/fake action) if every
  // assigned student already has at least one assessment.
  const nextToReview = assignments.find((a) => a.studentProfile.assessments.length === 0);

  const filteredAssignments = params.level
    ? assignments.filter((a) => a.studentProfile.assessments[0]?.supportLevel.order === Number(params.level))
    : assignments;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Hero row: the one EchoCard on this screen wraps ONLY the
          needs-attention hero card. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <EchoCard className="lg:flex-[1.6]">
          <Card className="h-full justify-between">
            <CardHeader>
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">{t("heroTag")}</p>
              <CardTitle className="text-base font-medium text-muted-foreground">{t("heroStat")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-5xl font-bold text-primary">{needsAttention.length}</p>
              <p className="text-sm text-muted-foreground">{t("heroDescription")}</p>
              <Sparkline values={weeklyAssessments} className="text-primary" />
            </CardContent>
          </Card>
        </EchoCard>

        <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalAssignedStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{assignments.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("approvedPlansStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{approvedPlanCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("needsRevisionStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{plansNeedingRevisionCount}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">
              {t("listTitle")} ({filteredAssignments.length})
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="GET" className="flex items-center gap-2">
              <select
                name="level"
                defaultValue={params.level ?? ""}
                className="flex h-11 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t("allLevels")}</option>
                {supportLevels.map((lvl: SupportLevel) => (
                  <option key={lvl.id} value={lvl.order}>
                    {tSupportLevel(String(lvl.order))}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                {t("filterButton")}
              </button>
            </form>
            {/* The one terracotta action on this screen — omitted entirely
                (not swapped for a fake destination) when there's no
                genuinely un-assessed student to point at. */}
            {nextToReview && (
              <Link
                href={`/specialist/students/${nextToReview.studentProfile.id}/review`}
                className={cn(buttonVariants({ variant: "accent" }), "min-h-11")}
              >
                {t("startReviewButton")}
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {params.level ? t("noStudentsForFilter") : t("noStudents")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tableStudent")}</TableHead>
                    <TableHead>{t("tableCategory")}</TableHead>
                    <TableHead>{t("tableSupportLevel")}</TableHead>
                    <TableHead>{t("tableLastAssessment")}</TableHead>
                    <TableHead>{t("tablePlanStatus")}</TableHead>
                    <TableHead>{t("tableOpenAlerts")}</TableHead>
                    <TableHead className="w-72">{t("tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map((a) => {
                    const sp = a.studentProfile;
                    const lastAssessment = sp.assessments[0];
                    const lastPlan = sp.supportPlans[0];
                    const openAlertCount = sp.mentorAlerts.length;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <p className="font-medium">{sp.user.fullName}</p>
                          <p className="text-xs text-muted-foreground">
                            {sp.studentNumber?.trim() ? sp.studentNumber : t("noStudentNumber")}
                          </p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {sp.user.email}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? (
                            <>
                              <p>{locale === "en" ? lastAssessment.condition.category.nameEn : lastAssessment.condition.category.nameAr}</p>
                              <p className="text-xs text-muted-foreground">
                                {locale === "en" ? lastAssessment.condition.nameEn : lastAssessment.condition.nameAr}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t("noAssessmentYet")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? tSupportLevel(String(lastAssessment.supportLevel.order)) : "—"}
                        </TableCell>
                        {/* text-start with dir="ltr" — see admin/audit-log/page.tsx. */}
                        <TableCell dir="ltr" className="text-start text-sm text-muted-foreground">
                          {lastAssessment ? formatDate(lastAssessment.assessedAt, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          {lastPlan ? (
                            <Badge variant="secondary">{tPlanStatus(lastPlan.status)}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t("noPlan")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {openAlertCount > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="size-3" />
                              {openAlertCount}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {/* These are navigation links styled to look like buttons, not
                                actions — per Base UI's own Button docs, a <Link>/<a> should
                                never be swapped in via Button's `render` prop (that's reserved
                                for elements that can take on real button semantics); style the
                                link directly with buttonVariants instead. Outline/default
                                (navy), never accent — the one accent action per screen is the
                                "Start review" button above, not these per-row links. */}
                            <Link
                              href={`/specialist/students/${sp.id}`}
                              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                            >
                              {t("detailsButton")}
                            </Link>
                            {/* Batch 3: assess + plan merged into one review
                                screen — one link now, not two, and outline
                                (not accent/default) since the one accent
                                action per screen is "Start review" above. */}
                            <Link
                              href={`/specialist/students/${sp.id}/review`}
                              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                            >
                              {t("reviewButton")}
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden note: the real, enforced boundary is assertSpecialistAssigned
          — a specialist only ever sees students an admin has explicitly
          assigned to them via SpecialistAssignment, never the tenant's
          full student roster (that's admin-only, via the university-wide
          bypass). */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
  );
}
