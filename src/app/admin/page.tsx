import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatRelativeDay } from "@/lib/format-date";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { EchoCard } from "@/components/ui/echo-card";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";
import { UniversityFilter } from "@/components/admin/university-filter";
import { localize } from "@/lib/localize";
import { ChevronLeft, ChevronRight, Download, Eye, Search, TrendingUp } from "lucide-react";
import type { Prisma, RequestStatus } from "@prisma/client";

const PAGE_SIZE = 5;

// Presentational-only options: this account's queries are tenant-scoped as
// a security boundary (see getTenantScopedPrisma), so there is no real data
// behind switching to another university from here — see
// components/admin/university-filter.tsx's own comment. Still real English
// labels (not machine-translated at render), since these are just static
// display strings, same as any other UI copy.
const MOCK_UNIVERSITY_OPTIONS = [
  { value: "king-saud", label: "جامعة الملك سعود", labelEn: "King Saud University" },
  { value: "king-abdulaziz", label: "جامعة الملك عبدالعزيز", labelEn: "King Abdulaziz University" },
  { value: "imam-mohammad", label: "جامعة الإمام محمد بن سعود", labelEn: "Imam Muhammad ibn Saud University" },
];

// Same 3-tone scheme as student/status's STATUS_TONE (this reference has no
// red anywhere): pending/under_review reads as "awaiting review", approved
// as "complete", rejected as "returned for changes".
const FILE_STATUS_TONE: Record<RequestStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  under_review: "bg-muted text-muted-foreground",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-accent/15 text-accent",
};

// The reference groups the 4 real request statuses into 3 filter tabs — the
// dashboard's "status" query param filters by this group, not the raw enum.
const STATUS_GROUPS = {
  pending: ["pending", "under_review"] as RequestStatus[],
  done: ["approved"] as RequestStatus[],
  returned: ["rejected"] as RequestStatus[],
};

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

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string; university?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminDashboard");
  const tAuditActions = await getTranslations("Common.auditActions");
  const locale = await getLocale();
  const { page: pageParam, status: statusParam, q, university } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const statusGroup = statusParam && statusParam in STATUS_GROUPS ? (statusParam as keyof typeof STATUS_GROUPS) : null;
  // Any university other than "all" isn't a real tenant this account can
  // query (see UniversityFilter's own comment) — force an honest empty
  // result instead of silently ignoring the filter or leaking this tenant's
  // data under another university's name.
  const isMockUniversitySelected = !!university && university !== "all";

  const where: Prisma.StudentProfileWhereInput = {
    deletedAt: null,
    ...(isMockUniversitySelected ? { id: "__none__" } : {}),
    ...(statusGroup ? { requestStatus: { in: STATUS_GROUPS[statusGroup] } } : {}),
    ...(q ? { user: { fullName: { contains: q, mode: "insensitive" } } } : {}),
  };

  const [allStudentsForHero, students, assignments, specialistCount, latestAuditLogs, auditEventsTodayCount, totalCount] =
    await Promise.all([
      db.studentProfile.findMany({ where: { deletedAt: null }, select: { id: true, createdAt: true } }),
      db.studentProfile.findMany({
        where,
        include: { user: { select: { fullName: true, fullNameEn: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      db.specialistAssignment.findMany({
        include: { specialist: { select: { fullName: true, fullNameEn: true } } },
      }),
      db.user.count({ where: { role: "specialist", active: true } }),
      // One row per student, most recent action first — grouped client-side
      // below since Prisma has no "distinct on, ordered by" in one query
      // across relations here.
      db.auditLog.findMany({
        where: { targetStudentProfileId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { targetStudentProfileId: true, action: true, createdAt: true },
      }),
      db.auditLog.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.studentProfile.count({ where }),
    ]);

  const specialistByStudentId = new Map(
    assignments.map((a) => [a.studentProfileId, localize(a.specialist.fullName, a.specialist.fullNameEn, locale)])
  );
  const assignedStudentIds = new Set(assignments.map((a) => a.studentProfileId));
  // .filter() instead of a size subtraction — an assignment can reference a
  // student outside allStudentsForHero (soft-deleted since assignment), which
  // made the subtraction go negative.
  const unassignedCount = allStudentsForHero.filter((s) => !assignedStudentIds.has(s.id)).length;

  const lastActionByStudentId = new Map<string, { action: string; createdAt: Date }>();
  for (const log of latestAuditLogs) {
    if (log.targetStudentProfileId && !lastActionByStudentId.has(log.targetStudentProfileId)) {
      lastActionByStudentId.set(log.targetStudentProfileId, { action: log.action, createdAt: log.createdAt });
    }
  }

  const weeklyRegistrations = weeklyRegistrationCounts(
    allStudentsForHero.map((s) => s.createdAt),
    12
  );
  const lastWeek = weeklyRegistrations[weeklyRegistrations.length - 1];
  const priorWeek = weeklyRegistrations[weeklyRegistrations.length - 2];
  const heroGrowthPct = priorWeek > 0 ? Math.round(((lastWeek - priorWeek) / priorWeek) * 100) : lastWeek > 0 ? 100 : 0;

  const firstName = (ctx.userFullName ?? "").trim().split(/\s+/)[0] ?? "";

  const navItems = await getAdminNavItems();

  function tabHref(group: keyof typeof STATUS_GROUPS | null) {
    const params = new URLSearchParams();
    if (group) params.set("status", group);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
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
      {firstName && <p className="mb-3 text-sm text-muted-foreground">{t("greeting", { name: firstName })}</p>}

      <p className="mb-2 text-[11px] font-bold tracking-[0.4px] text-muted-foreground">{t("platformNumbersOverline")}</p>

      {/* Reference: dashDir row, gap 16px, items-stretch, heroFlex 1.55 / statsFlex 1 */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <EchoCard className="lg:flex-[1.55]">
          <div className="flex h-full flex-col justify-between rounded-[22px] bg-primary px-[26px] py-6 text-primary-foreground shadow-[0_26px_50px_-26px_rgba(30,42,58,0.55),0_2px_5px_rgba(30,42,58,0.07)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10.5px] font-bold tracking-[1.6px] text-primary-foreground/[.86]">{t("heroTag")}</p>
                <p className="mt-3 text-[46px] leading-[1.15] font-extrabold tabular-nums text-primary-foreground">
                  {allStudentsForHero.length}
                </p>
              </div>
              {heroGrowthPct !== 0 && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground">
                  <TrendingUp className={cn("size-3.5", heroGrowthPct < 0 && "rotate-180")} />
                  {heroGrowthPct > 0 ? "+" : ""}
                  {heroGrowthPct}%
                </span>
              )}
            </div>
            <div className="pt-[22px]">
              <Sparkline values={weeklyRegistrations} className="h-[104px] text-primary-foreground" />
              <p className="mt-3 text-[11.5px] leading-[1.6] text-primary-foreground/[.86]">{t("chartCaption")}</p>
            </div>
          </div>
        </EchoCard>

        <div className="flex flex-col gap-3 lg:flex-1">
          {[
            { label: t("activeSpecialists"), value: specialistCount, sub: ctx.tenantName ?? "" },
            { label: t("unassignedStudents"), value: unassignedCount, sub: t("manualAssignmentSub") },
            { label: t("auditEventsToday"), value: auditEventsTodayCount, sub: undefined },
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

      {/* Reference: title+count pill+primary action row — bare, no card wrapper */}
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold">{t("tableTitle")}</h2>
          <span className="rounded-full bg-foreground/[.08] px-[9px] py-[3px] text-[11.5px] font-bold text-muted-foreground">
            {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <UniversityFilter options={MOCK_UNIVERSITY_OPTIONS} allLabel={t("allUniversities")} />
          <a
            href="/api/admin/export/students"
            download
            className={cn(buttonVariants({ variant: "accent" }), "min-h-11 gap-2 rounded-xl")}
          >
            <Download className="size-4" />
            {t("exportCsv")}
          </a>
        </div>
      </div>

      {/* Reference: search + filter tabs row — bare, no card wrapper */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <form method="GET" className="relative min-w-[200px] max-w-[330px] flex-1">
          {statusGroup && <input type="hidden" name="status" value={statusGroup} />}
          <Search className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t("searchPlaceholder")}
            className="h-[42px] rounded-xl ps-9"
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

      {/* Reference: the table itself is the only bordered/shadowed/rounded-18 container in this section */}
      <div className="mt-3.5 overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("tableStudent")}</TableHead>
                <TableHead>{t("tableSpecialist")}</TableHead>
                <TableHead>{t("tableLastAction")}</TableHead>
                <TableHead>{t("tableFileStatus")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => {
                const lastAction = lastActionByStudentId.get(s.id);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-normal break-words">
                      <p className="font-bold">{localize(s.user.fullName, s.user.fullNameEn, locale)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ctx.tenantName} · {localize(s.major, s.majorEn, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span dir="ltr">{s.user.email}</span>
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">
                      {specialistByStudentId.get(s.id) ?? (
                        <span className="text-muted-foreground">{t("notAssignedYet")}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words text-muted-foreground">
                      {lastAction ? (
                        <>
                          <p>{tAuditActions(lastAction.action)}</p>
                          <p className="text-xs">
                            <span dir="ltr">
                              {formatRelativeDay(lastAction.createdAt, locale, t("today"), t("yesterday"))}
                            </span>
                          </p>
                        </>
                      ) : (
                        t("noLastAction")
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={FILE_STATUS_TONE[s.requestStatus]}>
                        {s.requestStatus === "approved"
                          ? t("statusDone")
                          : s.requestStatus === "rejected"
                            ? t("statusReturned")
                            : t("statusPending")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/audit-log?student=${s.id}`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-lg")}
                      >
                        <Eye className="size-3.5" />
                        {t("openLabel")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {students.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("noMatchingRows")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("showingCount", { shown: students.length, total: totalCount })}</p>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin?page=${page + 1}${statusGroup ? `&status=${statusGroup}` : ""}${q ? `&q=${q}` : ""}`}
            aria-disabled={page * PAGE_SIZE >= totalCount}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              page * PAGE_SIZE >= totalCount && "pointer-events-none opacity-40"
            )}
          >
            <ChevronLeft className="size-4" />
          </Link>
          <Link
            href={`/admin?page=${page - 1}${statusGroup ? `&status=${statusGroup}` : ""}${q ? `&q=${q}` : ""}`}
            aria-disabled={page <= 1}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              page <= 1 && "pointer-events-none opacity-40"
            )}
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
