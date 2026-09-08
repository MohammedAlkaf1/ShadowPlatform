import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { formatRelativeDay } from "@/lib/format-date";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EchoCard } from "@/components/ui/echo-card";
import { Sparkline } from "@/components/ui/sparkline";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { CourseFilter } from "@/components/faculty/course-filter";
import { localize } from "@/lib/localize";
import { ChevronLeft, ChevronRight, Eye, Plus, Search, TrendingUp } from "lucide-react";
import type { RequestStatus } from "@prisma/client";

const PAGE_SIZE = 5;

// Same 3-tone scheme as the admin dashboard's own status badges — no dots
// anywhere in the app, per the standing design rule.
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

export default async function FacultyStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; status?: string; q?: string; page?: string }>;
}) {
  const ctx = await requireRole("faculty", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyStudents");
  const locale = await getLocale();
  const params = await searchParams;

  // Faculty only ever sees students linked to THEM via FacultyCourseLink,
  // and only the approved accommodations JSON — never medical reports,
  // diagnosis/category, or support level. Admin viewing this page sees the
  // whole tenant's links instead (university-wide access).
  const isAdminViewing = ctx.role === "admin";

  const [links, uploadedResources] = await Promise.all([
    db.facultyCourseLink.findMany({
      where: isAdminViewing ? {} : { facultyUserId: ctx.userId },
      include: { studentProfile: { include: { user: { select: { email: true, fullName: true, fullNameEn: true } } } } },
      orderBy: { courseCode: "asc" },
    }),
    // Full rows (not just a count) — needed for both the weekly trend chart
    // and the per-student "last custom file" column below.
    db.facultyResource.findMany({
      where: { ...(isAdminViewing ? {} : { uploadedByUserId: ctx.userId }), deletedAt: null },
      select: { studentProfileId: true, courseCode: true, createdAt: true },
    }),
  ]);

  // Access to a student's roster row is still an access to their record —
  // log one audit row per distinct student shown, not per course link row.
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.studentProfileId)) continue;
    seen.add(link.studentProfileId);
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "view_student_profile",
      resourceType: "FacultyCourseLink",
      targetStudentProfileId: link.studentProfileId,
    });
  }

  const distinctStudentCount = new Set(links.map((l) => l.studentProfileId)).size;
  const courseCodes = Array.from(new Set(links.map((l) => l.courseCode))).sort();
  const studentsWithAccommodations = new Set(
    links
      .filter((l) => {
        const acc = l.approvedAccommodations as Record<string, unknown> | null;
        return acc && Object.keys(acc).length > 0;
      })
      .map((l) => l.studentProfileId)
  ).size;
  const studentsWithoutAccommodations = distinctStudentCount - studentsWithAccommodations;

  const lastUploadByKey = new Map<string, Date>();
  for (const r of uploadedResources) {
    const key = `${r.studentProfileId}|${r.courseCode}`;
    const existing = lastUploadByKey.get(key);
    if (!existing || r.createdAt > existing) lastUploadByKey.set(key, r.createdAt);
  }

  const weeklyUploads = weeklyCounts(
    uploadedResources.map((r) => r.createdAt),
    12
  );
  const lastWeek = weeklyUploads[weeklyUploads.length - 1];
  const priorWeek = weeklyUploads[weeklyUploads.length - 2];
  const growthPct = priorWeek > 0 ? Math.round(((lastWeek - priorWeek) / priorWeek) * 100) : lastWeek > 0 ? 100 : 0;

  const firstName = (ctx.userFullName ?? "").trim().split(/\s+/)[0] ?? "";

  const statusGroup = params.status && params.status in STATUS_GROUPS ? (params.status as keyof typeof STATUS_GROUPS) : null;

  let filteredLinks = links;
  if (params.course) filteredLinks = filteredLinks.filter((l) => l.courseCode === params.course);
  if (statusGroup) {
    filteredLinks = filteredLinks.filter((l) => STATUS_GROUPS[statusGroup].includes(l.studentProfile.requestStatus));
  }
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    filteredLinks = filteredLinks.filter(
      (l) => l.studentProfile.user.fullName.toLowerCase().includes(q) || l.courseCode.toLowerCase().includes(q)
    );
  }

  const page = Math.max(1, Number(params.page) || 1);
  const totalFiltered = filteredLinks.length;
  const pagedLinks = filteredLinks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const navItems = await getFacultyNavItems();

  function tabHref(group: keyof typeof STATUS_GROUPS | null) {
    const qs = new URLSearchParams();
    if (group) qs.set("status", group);
    if (params.course) qs.set("course", params.course);
    if (params.q) qs.set("q", params.q);
    const s = qs.toString();
    return s ? `/faculty/students?${s}` : "/faculty/students";
  }

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (statusGroup) qs.set("status", statusGroup);
    if (params.course) qs.set("course", params.course);
    if (params.q) qs.set("q", params.q);
    qs.set("page", String(targetPage));
    return `/faculty/students?${qs.toString()}`;
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

        {/* Hero row: dark analytics card (weekly custom-file uploads trend)
            + 3 side stat cards, same pattern as the admin dashboard. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <EchoCard className="lg:flex-[1.55]">
            <div className="flex h-full flex-col justify-between rounded-[22px] bg-primary px-[26px] py-6 text-primary-foreground shadow-[0_26px_50px_-26px_rgba(30,42,58,0.55),0_2px_5px_rgba(30,42,58,0.07)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10.5px] font-bold tracking-[1.6px] text-primary-foreground/[.86]">{t("heroTag")}</p>
                  <p className="mt-3 text-[46px] leading-[1.15] font-extrabold tabular-nums text-primary-foreground">
                    {distinctStudentCount}
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
                <Sparkline values={weeklyUploads} className="h-[104px] text-primary-foreground" />
                <p className="mt-3 text-[11.5px] leading-[1.6] text-primary-foreground/[.86]">{t("chartCaption")}</p>
              </div>
            </div>
          </EchoCard>

          <div className="flex flex-col gap-3 lg:w-72 lg:shrink-0">
            {[
              {
                label: t("courseCountStat"),
                value: courseCodes.length,
                sub: courseCodes.join(locale === "en" ? ", " : "، ") || undefined,
              },
              { label: t("filesUploadedStat"), value: uploadedResources.length, sub: t("filesUploadedSub") },
              { label: t("noAccommodationsStat"), value: studentsWithoutAccommodations, sub: undefined },
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

        {/* Toolbar: title+count, primary upload action, course filter. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold">{t("listTitle")}</h2>
            <span className="rounded-full bg-foreground/[.08] px-[9px] py-[3px] text-[11.5px] font-bold text-muted-foreground">
              {totalFiltered}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <CourseFilter courseCodes={courseCodes} allLabel={t("allCourses")} />
            <Link
              href="/faculty/upload"
              className={cn(buttonVariants({ variant: "accent" }), "min-h-11 gap-2 rounded-xl")}
            >
              <Plus className="size-4" />
              {t("uploadButton")}
            </Link>
          </div>
        </div>

        {/* Search + quick filter tabs — bare row, same layout as the admin dashboard. */}
        <div className="flex flex-wrap items-center gap-2.5">
          <form method="GET" className="relative min-w-[200px] max-w-[330px] flex-1">
            {statusGroup && <input type="hidden" name="status" value={statusGroup} />}
            {params.course && <input type="hidden" name="course" value={params.course} />}
            <Search className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
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

        <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
          <div className="overflow-x-auto">
            {pagedLinks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {links.length === 0 ? t("noStudents") : t("noMatchingRows")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{t("tableStudentName")}</TableHead>
                    <TableHead>{t("tableCourse")}</TableHead>
                    <TableHead>{t("tableLastFile")}</TableHead>
                    <TableHead>{t("tableRequestStatus")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedLinks.map((link) => {
                    const lastUpload = lastUploadByKey.get(`${link.studentProfileId}|${link.courseCode}`);
                    const status = link.studentProfile.requestStatus;
                    return (
                      <TableRow key={link.id}>
                        <TableCell className="whitespace-normal break-words">
                          <p className="font-bold">
                            {localize(link.studentProfile.user.fullName, link.studentProfile.user.fullNameEn, locale)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <span dir="ltr">{link.studentProfile.user.email}</span>
                          </p>
                        </TableCell>
                        <TableCell className="font-medium">{link.courseCode}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {lastUpload ? (
                            <span dir="ltr">{formatRelativeDay(lastUpload, locale, t("today"), t("yesterday"))}</span>
                          ) : (
                            t("noLastFile")
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_TONE[status]}>
                            {status === "approved" ? t("statusDone") : status === "rejected" ? t("statusReturned") : t("statusPending")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/faculty/upload?link=${link.id}`}
                            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 rounded-lg")}
                          >
                            <Eye className="size-3.5" />
                            {t("filesActionButton")}
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
          <p className="text-xs text-muted-foreground">{t("showingCount", { shown: pagedLinks.length, total: totalFiltered })}</p>
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
