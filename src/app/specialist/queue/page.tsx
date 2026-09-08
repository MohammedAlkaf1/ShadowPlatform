import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatRelativeDay } from "@/lib/format-date";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EchoCard } from "@/components/ui/echo-card";
import { Sparkline } from "@/components/ui/sparkline";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { localize } from "@/lib/localize";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";
import { LevelFilter } from "@/components/specialist/level-filter";
import { ChevronLeft, ChevronRight, Eye, FileText, Search, TrendingUp } from "lucide-react";
import type { RequestStatus, SupportLevel } from "@prisma/client";

const PAGE_SIZE = 5;

// Same 3-tone scheme used on the admin dashboard and faculty roster — this
// screen's "حالة الخطة" column is really the student's own file/request
// status (StudentProfile.requestStatus), not SupportPlanStatus (which has
// different real states — draft/approved/expired), kept consistent with
// how every other roster table in the app already reads this field.
const STATUS_TONE: Record<RequestStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  under_review: "bg-muted text-muted-foreground",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-accent/15 text-accent",
};

const STATUS_GROUPS = {
  pending: ["pending", "under_review"] as RequestStatus[],
  done: ["approved"] as RequestStatus[],
  returned: ["rejected"] as RequestStatus[],
};

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
  searchParams: Promise<{ level?: string; status?: string; q?: string; page?: string }>;
}) {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistQueue");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();
  const params = await searchParams;
  const isAdminViewing = ctx.role === "admin";

  const [assignments, supportLevels, assignedDocuments] = await Promise.all([
    db.specialistAssignment.findMany({
      where: isAdminViewing ? {} : { specialistUserId: ctx.userId },
      include: {
        studentProfile: {
          include: {
            user: { select: { email: true, fullName: true, fullNameEn: true } },
            assessments: {
              orderBy: { assessedAt: "desc" },
              take: 1,
              include: { supportLevel: true },
            },
            supportPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
    // Real per-student document history for both the "last document" column
    // and the hero card (pending-classification count + weekly trend of
    // documents that reached this specialist for review).
    db.document.findMany({
      where: {
        deletedAt: null,
        studentProfile: isAdminViewing ? {} : { specialistAssignments: { some: { specialistUserId: ctx.userId } } },
      },
      orderBy: { createdAt: "desc" },
      select: { studentProfileId: true, status: true, createdAt: true },
    }),
  ]);

  const lastDocByStudentId = new Map<string, Date>();
  for (const doc of assignedDocuments) {
    if (!lastDocByStudentId.has(doc.studentProfileId)) lastDocByStudentId.set(doc.studentProfileId, doc.createdAt);
  }
  const pendingDocCount = assignedDocuments.filter((d) => d.status === "pending").length;

  const approvedPlanCount = assignments.filter((a) => a.studentProfile.supportPlans[0]?.status === "approved").length;
  const plansNeedingRevisionCount = assignments.filter((a) => {
    const status = a.studentProfile.supportPlans[0]?.status;
    return status === "draft" || status === "expired";
  }).length;

  const weeklyDocuments = weeklyCounts(
    assignedDocuments.map((d) => d.createdAt),
    12
  );
  const lastWeek = weeklyDocuments[weeklyDocuments.length - 1];
  const priorWeek = weeklyDocuments[weeklyDocuments.length - 2];
  const growthPct = priorWeek > 0 ? Math.round(((lastWeek - priorWeek) / priorWeek) * 100) : lastWeek > 0 ? 100 : 0;

  const firstName = (ctx.userFullName ?? "").trim().split(/\s+/)[0] ?? "";

  // "Start review" primary action: the most recently assigned student who
  // hasn't been assessed yet at all — omitted entirely (no fake destination)
  // if every assigned student already has at least one assessment.
  const nextToReview = assignments.find((a) => a.studentProfile.assessments.length === 0);

  const statusGroup = params.status && params.status in STATUS_GROUPS ? (params.status as keyof typeof STATUS_GROUPS) : null;

  let filteredAssignments = assignments;
  if (params.level) {
    filteredAssignments = filteredAssignments.filter(
      (a) => a.studentProfile.assessments[0]?.supportLevel.order === Number(params.level)
    );
  }
  if (statusGroup) {
    filteredAssignments = filteredAssignments.filter((a) =>
      STATUS_GROUPS[statusGroup].includes(a.studentProfile.requestStatus)
    );
  }
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    filteredAssignments = filteredAssignments.filter((a) =>
      a.studentProfile.user.fullName.toLowerCase().includes(q)
    );
  }

  const page = Math.max(1, Number(params.page) || 1);
  const totalFiltered = filteredAssignments.length;
  const pagedAssignments = filteredAssignments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const levelOptions = supportLevels.map((lvl: SupportLevel) => ({
    value: String(lvl.order),
    label: tSupportLevel(String(lvl.order)),
  }));

  const navItems = await getSpecialistNavItems();

  function tabHref(group: keyof typeof STATUS_GROUPS | null) {
    const qs = new URLSearchParams();
    if (group) qs.set("status", group);
    if (params.level) qs.set("level", params.level);
    if (params.q) qs.set("q", params.q);
    const s = qs.toString();
    return s ? `/specialist/queue?${s}` : "/specialist/queue";
  }

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (statusGroup) qs.set("status", statusGroup);
    if (params.level) qs.set("level", params.level);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(targetPage));
    return `/specialist/queue?${qs.toString()}`;
  }

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <div className="space-y-6">
        {firstName && <p className="text-sm text-muted-foreground">{t("greeting", { name: firstName })}</p>}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <EchoCard className="lg:flex-[1.55]">
            <div className="flex h-full flex-col justify-between rounded-[22px] bg-primary px-[26px] py-6 text-primary-foreground shadow-[0_26px_50px_-26px_rgba(30,42,58,0.55),0_2px_5px_rgba(30,42,58,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-bold tracking-[1.6px] text-primary-foreground/[.86]">{t("heroTag")}</p>
                  <p className="mt-3 text-[46px] leading-[1.15] font-extrabold tabular-nums text-primary-foreground">
                    {pendingDocCount}
                  </p>
                </div>
                {growthPct !== 0 && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground">
                    <TrendingUp className={cn("size-3.5", growthPct < 0 && "rotate-180")} />
                    {growthPct > 0 ? "+" : ""}
                    {growthPct}%
                  </span>
                )}
              </div>
              <div className="pt-[22px]">
                <Sparkline values={weeklyDocuments} className="h-[104px] text-primary-foreground" />
                <p className="mt-3 text-[11.5px] leading-[1.6] text-primary-foreground/[.86]">{t("chartCaption")}</p>
              </div>
            </div>
          </EchoCard>

          <div className="flex flex-col gap-3 lg:w-72 lg:shrink-0">
            {[
              { label: t("totalAssignedStat"), value: assignments.length, sub: t("oneUniversitySub") },
              { label: t("approvedPlansStat"), value: approvedPlanCount, sub: t("thisTermSub") },
              { label: t("needsRevisionStat"), value: plansNeedingRevisionCount, sub: t("termEndSub") },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-1 flex-col justify-center rounded-[18px] border border-border bg-card px-[18px] py-4 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]"
              >
                <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                <p className="mt-1.5 text-[30px] leading-[1.2] font-extrabold tabular-nums">{stat.value}</p>
                {stat.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold">{t("listTitle")}</h2>
            <span className="rounded-full bg-foreground/[.08] px-[9px] py-[3px] text-[11.5px] font-bold text-muted-foreground">
              {totalFiltered}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <LevelFilter options={levelOptions} allLabel={t("allLevels")} />
            {/* The one accent CTA on this screen — omitted (not swapped for
                a fake destination) when there's no un-assessed student. */}
            {nextToReview && (
              <Link
                href={`/specialist/students/${nextToReview.studentProfile.id}/review`}
                className={cn(buttonVariants({ variant: "accent" }), "min-h-11 gap-2 rounded-xl")}
              >
                <FileText className="size-4" />
                {t("startReviewButton")}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <form method="GET" className="relative min-w-[200px] max-w-[330px] flex-1">
            {statusGroup && <input type="hidden" name="status" value={statusGroup} />}
            {params.level && <input type="hidden" name="level" value={params.level} />}
            <Search className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder={t("searchPlaceholder")}
              className="h-[42px] rounded-full ps-9"
            />
          </form>
          <div className="flex flex-wrap gap-2">
            {(["all", "pending", "done", "returned"] as const).map((g) => {
              const active = g === "all" ? !statusGroup : statusGroup === g;
              return (
                <Link
                  key={g}
                  href={tabHref(g === "all" ? null : g)}
                  className={cn(
                    buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                    "min-h-9 rounded-lg"
                  )}
                >
                  {t(`tab_${g}`)}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
          <div className="overflow-x-auto">
            {pagedAssignments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {assignments.length === 0 ? t("noStudents") : t("noStudentsForFilter")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{t("tableStudent")}</TableHead>
                    <TableHead>{t("tableSupportLevel")}</TableHead>
                    <TableHead>{t("tableLastDocument")}</TableHead>
                    <TableHead>{t("tablePlanStatus")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedAssignments.map((a) => {
                    const sp = a.studentProfile;
                    const lastAssessment = sp.assessments[0];
                    const lastDoc = lastDocByStudentId.get(sp.id);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-normal break-words">
                          <p className="font-bold">{localize(sp.user.fullName, sp.user.fullNameEn, locale)}</p>
                          <p className="text-xs text-muted-foreground">
                            {localize(sp.major, sp.majorEn, locale)} · {ctx.tenantName}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? tSupportLevel(String(lastAssessment.supportLevel.order)) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lastDoc ? (
                            <span dir="ltr">{formatRelativeDay(lastDoc, locale, t("today"), t("yesterday"))}</span>
                          ) : (
                            t("noDocuments")
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_TONE[sp.requestStatus]}>
                            {sp.requestStatus === "approved"
                              ? t("statusDone")
                              : sp.requestStatus === "rejected"
                                ? t("statusReturned")
                                : t("statusPending")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/specialist/students/${sp.id}/review`}
                            className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-1.5 rounded-lg")}
                          >
                            <Eye className="size-3.5" />
                            {t("reviewButton")}
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t("showingCount", { shown: pagedAssignments.length, total: totalFiltered })}</p>
          <div className="flex items-center gap-2">
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page * PAGE_SIZE >= totalFiltered}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon" }),
                "rounded-xl",
                page * PAGE_SIZE >= totalFiltered && "pointer-events-none opacity-40"
              )}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={pageHref(page - 1)}
              aria-disabled={page <= 1}
              className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-xl", page <= 1 && "pointer-events-none opacity-40")}
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
