import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { NavIcon } from "@/components/layout/nav-icon";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

const PERIODS = ["week", "month", "term"] as const;
type Period = (typeof PERIODS)[number];

// Reference: rpPeriods "هذا الأسبوع/هذا الشهر/الفصل الدراسي" — 7/30/90-day
// windows, each compared to the equal-length window right before it.
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, term: 90 };
// Reference: rpTrendLabels — week groups by day (7 bars), month by week (4
// bars), term by month (4 bars).
const PERIOD_BUCKETS: Record<Period, { count: number; unitDays: number }> = {
  week: { count: 7, unitDays: 1 },
  month: { count: 4, unitDays: 7 },
  term: { count: 4, unitDays: 22 },
};

function countInRange(dates: Date[], from: Date, to: Date): number {
  return dates.filter((d) => d >= from && d < to).length;
}

function bucketCounts(dates: Date[], count: number, unitDays: number): number[] {
  const now = Date.now();
  const msPerUnit = unitDays * 24 * 60 * 60 * 1000;
  const buckets = new Array(count).fill(0) as number[];
  for (const d of dates) {
    const unitsAgo = Math.floor((now - d.getTime()) / msPerUnit);
    const idx = count - 1 - unitsAgo;
    if (idx >= 0 && idx < count) buckets[idx] += 1;
  }
  return buckets;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminReports");
  const locale = await getLocale();
  const { period: periodParam } = await searchParams;
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "week";

  const now = new Date();
  const periodStart = new Date(now.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(periodStart.getTime() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);

  const [students, assessments, categories] = await Promise.all([
    db.studentProfile.findMany({
      where: { deletedAt: null },
      select: { id: true, createdAt: true, requestStatus: true },
    }),
    db.assessment.findMany({
      select: { createdAt: true, studentProfileId: true, condition: { select: { categoryId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.category.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
  ]);

  const studentDates = students.map((s) => s.createdAt);
  const assessmentDates = assessments.map((a) => a.createdAt);

  const newRequests = countInRange(studentDates, periodStart, now);
  const prevNewRequests = countInRange(studentDates, prevPeriodStart, periodStart);

  const documentsClassified = countInRange(assessmentDates, periodStart, now);
  const prevDocumentsClassified = countInRange(assessmentDates, prevPeriodStart, periodStart);

  const studentCreatedById = new Map(students.map((s) => [s.id, s.createdAt]));
  const firstAssessmentByStudent = new Map<string, Date>();
  for (const a of assessments) {
    if (!firstAssessmentByStudent.has(a.studentProfileId)) firstAssessmentByStudent.set(a.studentProfileId, a.createdAt);
  }
  function avgReviewDaysInRange(from: Date, to: Date): number | null {
    const durationsMs: number[] = [];
    for (const [studentId, firstAssessedAt] of firstAssessmentByStudent) {
      if (firstAssessedAt < from || firstAssessedAt >= to) continue;
      const registeredAt = studentCreatedById.get(studentId);
      if (registeredAt) durationsMs.push(firstAssessedAt.getTime() - registeredAt.getTime());
    }
    if (durationsMs.length === 0) return null;
    const avgMs = durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length;
    return avgMs / (1000 * 60 * 60 * 24);
  }
  const avgReviewDays = avgReviewDaysInRange(periodStart, now);
  const prevAvgReviewDays = avgReviewDaysInRange(prevPeriodStart, periodStart);

  const overdueThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const overdueNow = students.filter(
    (s) => (s.requestStatus === "pending" || s.requestStatus === "under_review") && s.createdAt <= overdueThreshold
  ).length;

  const categoryCounts = new Map<string, number>();
  for (const a of assessments) {
    categoryCounts.set(a.condition.categoryId, (categoryCounts.get(a.condition.categoryId) ?? 0) + 1);
  }
  const totalClassified = assessments.length;
  const mix = categories
    .map((c) => ({
      label: locale === "en" ? c.nameEn : c.nameAr,
      count: categoryCounts.get(c.id) ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const bars = bucketCounts(studentDates, PERIOD_BUCKETS[period].count, PERIOD_BUCKETS[period].unitDays);
  const maxBar = Math.max(1, ...bars);

  function periodHref(p: Period) {
    return `/admin/reports?period=${p}`;
  }

  function kpiDelta(current: number, previous: number): { text: string; up: boolean } {
    const diff = current - previous;
    if (diff === 0) return { text: t("deltaNoChange"), up: true };
    return { text: t(diff > 0 ? "deltaMore" : "deltaFewer", { count: Math.abs(diff) }), up: diff >= 0 };
  }

  const requestsDelta = kpiDelta(newRequests, prevNewRequests);
  const documentsDelta = kpiDelta(documentsClassified, prevDocumentsClassified);
  const reviewTimeDelta =
    avgReviewDays !== null && prevAvgReviewDays !== null
      ? (() => {
          const diffDays = prevAvgReviewDays - avgReviewDays;
          if (Math.abs(diffDays) < 0.05) return { text: t("deltaNoChange"), up: true };
          return { text: t("deltaReviewTime", { days: Math.abs(diffDays).toFixed(1) }), up: diffDays >= 0 };
        })()
      : null;

  const navItems = await getAdminNavItems();

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
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex w-fit gap-[3px] rounded-xl bg-foreground/[.08] p-[3px]">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={periodHref(p)}
              className={cn(
                "flex min-h-[38px] items-center rounded-lg px-[18px] text-[13.5px] font-bold",
                p === period ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {t(`period_${p}`)}
            </Link>
          ))}
        </div>
        <a
          href="/api/admin/export/students"
          download
          className={cn(buttonVariants({ variant: "accent" }), "min-h-11 gap-2 rounded-xl")}
        >
          <NavIcon name="download" className="size-[18px]" />
          {t("exportCsv")}
        </a>
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("kpiNewRequests"), value: String(newRequests), delta: requestsDelta },
          { label: t("kpiDocumentsClassified"), value: String(documentsClassified), delta: documentsDelta },
          {
            label: t("kpiAvgReviewTime"),
            value: avgReviewDays !== null ? t("daysValue", { days: avgReviewDays.toFixed(1) }) : "—",
            delta: reviewTimeDelta,
          },
          { label: t("kpiOverdueRequests"), value: String(overdueNow), delta: null },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[18px] border border-border bg-card p-[18px] shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]"
          >
            <p className="text-[11.5px] font-bold text-muted-foreground">{kpi.label}</p>
            <p className="mt-1.5 text-[29px] leading-[1.2] font-extrabold">{kpi.value}</p>
            {kpi.delta && (
              <div
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 text-xs font-bold",
                  kpi.delta.up ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                )}
              >
                <NavIcon name="chevron" className={cn("size-3.5", kpi.delta.up ? "rotate-180" : "")} />
                {kpi.delta.text}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <div className="flex flex-col rounded-[22px] bg-primary px-6 py-[22px] text-primary-foreground shadow-[0_26px_50px_-26px_rgba(30,42,58,0.55),0_2px_5px_rgba(30,42,58,0.07)] lg:flex-[1.6]">
          <p className="text-[10.5px] font-bold tracking-[1.6px] text-primary-foreground/[.86]">
            {t("trendTitle")}
          </p>
          <p className="mt-[11px] text-[34px] leading-[1.2] font-extrabold">
            {t("trendTotal", { count: newRequests })}
          </p>
          <div className="pt-[26px]">
            <div className="flex h-[104px] items-end gap-2">
              {bars.map((v, i) => (
                <div key={i} className="h-full flex-1">
                  <div
                    className="w-full rounded-[5px] bg-primary-foreground/70"
                    style={{ height: `${Math.max(4, (v / maxBar) * 100)}%`, marginTop: "auto" }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-primary-foreground/[.86]">{t(`trendCaption_${period}`)}</p>
          </div>
        </div>

        <div className="rounded-[22px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)] lg:flex-1">
          <p className="text-base font-extrabold">{t("mixTitle")}</p>
          <div className="mt-[18px] flex flex-col gap-[15px]">
            {mix.length === 0 && <p className="text-sm text-muted-foreground">{t("mixEmpty")}</p>}
            {mix.map((m) => {
              const pct = totalClassified > 0 ? Math.round((m.count / totalClassified) * 100) : 0;
              return (
                <div key={m.label}>
                  <div className="flex items-baseline justify-between gap-2.5">
                    <span className="text-[13.5px] font-bold">{m.label}</span>
                    <span className="shrink-0 text-xs font-bold text-muted-foreground">
                      {m.count} · {pct}%
                    </span>
                  </div>
                  <div className="mt-[7px] h-2 overflow-hidden rounded-full bg-foreground/[.08]">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reference's rpReady table: 4 fixed, named export-ready reports.
          Only one real generator exists in this app (/api/admin/export/students,
          the requests+approvals CSV) — all 4 rows link to it, since a dead
          button would be worse than reusing the one real export, but the
          PDF/XLSX format badges here are illustrative (matching the design)
          rather than backed by their own generators. */}
      <div className="mt-4 overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
        <div className="flex items-center gap-4 bg-muted/40 px-5 py-3">
          <p className="flex-[2.6] text-[11px] font-bold text-muted-foreground">{t("readyName")}</p>
          <p className="flex-[1.6] text-[11px] font-bold text-muted-foreground">{t("readyScope")}</p>
          <p className="flex-[0.8] text-[11px] font-bold text-muted-foreground">{t("readyFormat")}</p>
          <p className="flex-[0.9] text-end text-[11px] font-bold text-muted-foreground">{t("readyAction")}</p>
        </div>
        {[
          { name: t("readyReport1Name"), scope: t("readyReport1Scope"), format: "CSV" },
          { name: t("readyReport2Name"), scope: ctx.tenantName ?? "", format: "CSV" },
          { name: t("readyReport3Name"), scope: t("readyReport3Scope"), format: "PDF" },
          { name: t("readyReport4Name"), scope: t("readyReport1Scope"), format: "XLSX" },
        ].map((r) => (
          <div key={r.name} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
            <div className="flex flex-[2.6] items-center gap-2.5">
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] border border-border bg-background text-muted-foreground">
                <NavIcon name="chart" className="size-[17px]" />
              </span>
              <span className="text-[13.5px] font-bold">{r.name}</span>
            </div>
            <p className="flex-[1.6] text-[13px] text-muted-foreground">{r.scope}</p>
            <div className="flex-[0.8]">
              <span dir="ltr" className="inline-block rounded-md bg-foreground/[.08] px-2 py-0.5 text-[11px] font-bold tracking-wide text-muted-foreground">
                {r.format}
              </span>
            </div>
            <div className="flex flex-[0.9] justify-end">
              <a
                href="/api/admin/export/students"
                download
                className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3.5 py-2 text-[12.5px] font-bold text-accent hover:bg-accent hover:text-accent-foreground"
              >
                <NavIcon name="download" className="size-[15px]" />
                {t("readyDownload")}
              </a>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
