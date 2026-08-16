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
import { Users } from "lucide-react";
import { CategoryChart } from "./category-chart";
import type { RequestStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

const REQUEST_STATUS_VALUES: RequestStatus[] = ["pending", "under_review", "approved", "rejected"];

/** Registrations per week for the last `weeks` weeks, oldest first — the
 * hero card's sparkline. A plain module-level helper (not inline in the
 * component body) specifically so the `Date.now()` call inside it doesn't
 * trip the "impure function during render" lint rule — same pattern
 * already established in student/status/page.tsx. */
function weeklyRegistrationCounts(createdAtDates: Date[], weeks: number): number[] {
  const now = Date.now();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const buckets = new Array(weeks).fill(0) as number[];
  for (const d of createdAtDates) {
    const weeksAgo = Math.floor((now - d.getTime()) / msPerWeek);
    const idx = weeks - 1 - weeksAgo;
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets;
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminStats");
  const tRequestStatus = await getTranslations("Common.requestStatus");
  const tActions = await getTranslations("Common.actions");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();
  const params = await searchParams;

  function formatDuration(ms: number): string {
    const days = ms / (1000 * 60 * 60 * 24);
    if (days < 1) return `${(ms / (1000 * 60 * 60)).toFixed(1)} ${t("hours")}`;
    return `${days.toFixed(1)} ${t("days")}`;
  }

  const [students, categories, supportLevels, allAssessments, assignments, requestsList] = await Promise.all([
    db.studentProfile.findMany({
      where: { deletedAt: null },
      select: { id: true, requestStatus: true, createdAt: true },
    }),
    db.category.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" }, select: { id: true, nameAr: true, order: true } }),
    db.assessment.findMany({
      select: {
        studentProfileId: true,
        createdAt: true,
        condition: { select: { categoryId: true } },
        supportLevelId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    // Cheap additive query (existence check only, not full rows) for the
    // hero's 3rd side stat and the requests table's assignment column —
    // same tenant scoping as everything else via getTenantScopedPrisma,
    // no change to any existing query's filtering/security logic.
    db.specialistAssignment.findMany({ select: { studentProfileId: true } }),
    db.studentProfile.findMany({
      where: {
        deletedAt: null,
        ...(params.status && REQUEST_STATUS_VALUES.includes(params.status as RequestStatus)
          ? { requestStatus: params.status as RequestStatus }
          : {}),
      },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Latest classification per student (a student may have been reassessed
  // over time — "count per category/level" reads as their CURRENT one).
  const latestByStudent = new Map<string, (typeof allAssessments)[number]>();
  for (const a of allAssessments) {
    latestByStudent.set(a.studentProfileId, a); // assessments are ordered asc, so last write wins = latest
  }

  const categoryCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  for (const a of latestByStudent.values()) {
    categoryCounts.set(a.condition.categoryId, (categoryCounts.get(a.condition.categoryId) ?? 0) + 1);
    levelCounts.set(a.supportLevelId, (levelCounts.get(a.supportLevelId) ?? 0) + 1);
  }

  const categoryChartData = categories.map((c) => ({
    name: locale === "en" ? c.nameEn : c.nameAr,
    count: categoryCounts.get(c.id) ?? 0,
  }));

  const pendingCount = students.filter((s) => s.requestStatus === "pending").length;
  const underReviewCount = students.filter((s) => s.requestStatus === "under_review").length;
  const assignedStudentIds = new Set(assignments.map((a) => a.studentProfileId));
  const needsAssignmentCount = students.filter(
    (s) => s.requestStatus === "pending" || !assignedStudentIds.has(s.id)
  ).length;

  // Average time-to-review: registration (StudentProfile.createdAt) to the
  // FIRST assessment ever recorded for that student.
  const firstAssessmentByStudent = new Map<string, Date>();
  for (const a of allAssessments) {
    if (!firstAssessmentByStudent.has(a.studentProfileId)) {
      firstAssessmentByStudent.set(a.studentProfileId, a.createdAt);
    }
  }
  const studentById = new Map(students.map((s) => [s.id, s]));
  const reviewDurationsMs: number[] = [];
  for (const [studentId, firstAssessedAt] of firstAssessmentByStudent) {
    const student = studentById.get(studentId);
    if (!student) continue;
    reviewDurationsMs.push(firstAssessedAt.getTime() - student.createdAt.getTime());
  }
  const avgReviewMs =
    reviewDurationsMs.length > 0 ? reviewDurationsMs.reduce((a, b) => a + b, 0) / reviewDurationsMs.length : null;

  const weeklyRegistrations = weeklyRegistrationCounts(
    students.map((s) => s.createdAt),
    12
  );

  const navItems = await getAdminNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
    <div className="space-y-6">
      {/* Hero row: the one EchoCard on this screen wraps ONLY the total-
          students hero card. The 3 side stats are plain cards, no echo. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <EchoCard className="lg:flex-[1.6]">
          <Card className="h-full justify-between rounded-[24px]">
            <CardHeader>
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">{t("heroTag")}</p>
              <CardTitle className="text-base font-medium text-muted-foreground">{t("totalStudents")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-5xl font-bold text-primary">{students.length}</p>
              <p className="text-sm text-muted-foreground">{t("heroDescription")}</p>
              <Sparkline values={weeklyRegistrations} className="text-primary" />
            </CardContent>
          </Card>
        </EchoCard>

        <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("pending")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("underReview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{underReviewCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("needsAssignmentStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{needsAssignmentCount}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("byCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryChart data={categoryChartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bySupportLevel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {supportLevels.map((lvl) => (
              <li key={lvl.id} className="rounded-md border border-border bg-secondary/40 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{levelCounts.get(lvl.id) ?? 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tSupportLevel(String(lvl.order))}</p>
              </li>
            ))}
          </ul>
          {avgReviewMs !== null && (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("avgReviewTime")}: <span className="font-medium text-foreground">{formatDuration(avgReviewMs)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Table section: requests filterable by status, one terracotta
          primary action ("Manage users" -> where assignment actually
          happens) at the row's end. */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">{t("requestsTableTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t("requestsTableSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form method="GET" className="flex items-center gap-2">
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="flex h-11 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{tActions("all")}</option>
                {REQUEST_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {tRequestStatus(s)}
                  </option>
                ))}
              </select>
              <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}>
                {tActions("apply")}
              </button>
            </form>
            {/* The one terracotta action on this screen. */}
            <Link href="/admin/users" className={cn(buttonVariants({ variant: "accent" }), "min-h-11")}>
              <Users className="size-4" />
              {t("manageUsersButton")}
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {requestsList.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noMatchingRequests")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tableStudent")}</TableHead>
                    <TableHead>{t("tableRequestStatus")}</TableHead>
                    <TableHead>{t("tableAssignment")}</TableHead>
                    <TableHead>{t("tableRegistered")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsList.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <p>{s.user.fullName}</p>
                        <p dir="ltr" className="text-xs text-muted-foreground">
                          {s.user.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tRequestStatus(s.requestStatus)}</Badge>
                      </TableCell>
                      <TableCell>
                        {assignedStudentIds.has(s.id) ? (
                          <Badge variant="secondary">{t("assignedLabel")}</Badge>
                        ) : (
                          <Badge variant="destructive">{t("notAssignedLabel")}</Badge>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="text-start text-muted-foreground">
                        {formatDate(s.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden note: the true, enforced boundary for admin is tenant
          isolation (getTenantScopedPrisma) — admins otherwise have
          university-wide access within their own tenant (assertSpecialistAssigned
          bypasses the assignment check for role==admin), so the one real
          thing they never see is another university's data. */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
    </AppShell>
  );
}
