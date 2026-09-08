import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { localize } from "@/lib/localize";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EchoCard } from "@/components/ui/echo-card";
import { Sparkline } from "@/components/ui/sparkline";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Eye, FileText, Search, Upload } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getStudentNavItems } from "@/components/layout/nav-items";

const NEW_BADGE_WINDOW_DAYS = 3;

function newBadgeCutoffDate(): Date {
  return new Date(Date.now() - NEW_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
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

const FILTER_GROUPS = {
  pending: "pending",
  done: "done",
  returned: "returned",
} as const;

export default async function StudentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentStatus");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const locale = await getLocale();
  const params = await searchParams;

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });

  const facultyResources = studentProfile
    ? await db.facultyResource.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { email: true, fullName: true, fullNameEn: true } } },
      })
    : [];
  const documents = studentProfile
    ? await db.document.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, originalFilename: true, originalFilenameEn: true, createdAt: true, status: true },
      })
    : [];
  const newBadgeCutoff = newBadgeCutoffDate();
  const wasReturned = studentProfile?.requestStatus === "rejected";
  const distinctFacultyCount = new Set(facultyResources.map((r) => r.uploadedBy.email)).size;

  type UnifiedFile = {
    id: string;
    name: string;
    note?: string;
    sourceLabel: string;
    date: Date;
    statusLabel: string;
    statusTone: string;
    source: "mine" | "faculty";
    openHref: string | null;
    isNew: boolean;
    group: "pending" | "done" | "returned";
  };

  const unifiedFiles: UnifiedFile[] = [
    ...documents.map((d): UnifiedFile => {
      const group: UnifiedFile["group"] = wasReturned ? "returned" : d.status === "reviewed" ? "done" : "pending";
      return {
        id: d.id,
        name: localize(d.originalFilename, d.originalFilenameEn, locale),
        note: t("noteMine"),
        sourceLabel: t("sourceMe"),
        date: d.createdAt,
        statusLabel: wasReturned ? t("statusReturned") : tDocumentStatus(d.status === "reviewed" ? "reviewed" : "pending"),
        statusTone: wasReturned
          ? "bg-accent/15 text-accent"
          : d.status === "reviewed"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"
            : "bg-muted text-muted-foreground",
        source: "mine",
        openHref: `/student/documents/${d.id}`,
        isNew: false,
        group,
      };
    }),
    ...facultyResources.map(
      (r): UnifiedFile => ({
        id: r.id,
        name: localize(r.title, r.titleEn, locale),
        note: localize(r.note ?? "", r.noteEn, locale) || t("noteFaculty"),
        sourceLabel: localize(r.uploadedBy.fullName, r.uploadedBy.fullNameEn, locale),
        date: r.createdAt,
        statusLabel: tDocumentStatus("reviewed"),
        statusTone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
        source: "faculty",
        openHref: `/api/student/faculty-resources/${r.id}/download`,
        isNew: r.createdAt >= newBadgeCutoff,
        group: "done",
      })
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filterGroup = params.filter && params.filter in FILTER_GROUPS ? (params.filter as keyof typeof FILTER_GROUPS) : null;
  let filteredFiles = filterGroup ? unifiedFiles.filter((f) => f.group === filterGroup) : unifiedFiles;
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    filteredFiles = filteredFiles.filter((f) => f.name.toLowerCase().includes(q) || f.sourceLabel.toLowerCase().includes(q));
  }

  const weeklyDocuments = weeklyCounts(
    documents.map((d) => d.createdAt),
    12
  );
  const lastWeek = weeklyDocuments[weeklyDocuments.length - 1];
  const priorWeek = weeklyDocuments[weeklyDocuments.length - 2];
  const growthPct = priorWeek > 0 ? Math.round(((lastWeek - priorWeek) / priorWeek) * 100) : lastWeek > 0 ? 100 : 0;

  const lastDocument = unifiedFiles.find((f) => f.source === "mine");
  const firstName = (ctx.userFullName ?? "").trim().split(/\s+/)[0] ?? "";

  const navItems = await getStudentNavItems();

  function filterHref(group: keyof typeof FILTER_GROUPS | null) {
    const qs = new URLSearchParams();
    if (group) qs.set("filter", group);
    if (params.q) qs.set("q", params.q);
    const s = qs.toString();
    return s ? `/student/status?${s}` : "/student/status";
  }

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle=""
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
                    {documents.length}
                  </p>
                </div>
                {growthPct !== 0 && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11.5px] font-bold text-primary-foreground">
                    {growthPct > 0 ? "↑" : "↓"} {Math.abs(growthPct)}%
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
              { label: t("sharedFilesStat"), value: facultyResources.length, sub: t("fromFacultySub", { count: distinctFacultyCount }) },
              {
                label: t("lastDocStatusStat"),
                value: lastDocument ? lastDocument.statusLabel : "—",
                sub: null,
                big: false,
              },
              { label: t("followingFacultyStat"), value: distinctFacultyCount, sub: t("thisTermSub") },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-1 flex-col justify-center rounded-[18px] border border-border bg-card px-[18px] py-4 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]"
              >
                <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
                {typeof stat.value === "number" ? (
                  <p className="mt-1.5 text-[30px] leading-[1.2] font-extrabold tabular-nums">{stat.value}</p>
                ) : (
                  <p className="mt-1.5 text-lg font-extrabold">{stat.value}</p>
                )}
                {stat.sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.sub}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold">{t("filesTableTitle", { count: filteredFiles.length })}</h2>
          </div>
          <Link href="/student/upload" className={cn(buttonVariants({ variant: "accent" }), "min-h-11 gap-2 rounded-xl")}>
            <Upload className="size-4" />
            {t("uploadButton")}
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <form method="GET" className="relative min-w-[200px] max-w-[330px] flex-1">
            {filterGroup && <input type="hidden" name="filter" value={filterGroup} />}
            <Search className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
            <Input type="search" name="q" defaultValue={params.q ?? ""} placeholder={t("searchPlaceholder")} className="h-[42px] rounded-full ps-9" />
          </form>
          <div className="flex flex-wrap gap-2">
            {([null, "pending", "done", "returned"] as const).map((g) => {
              const active = g === null ? !filterGroup : filterGroup === g;
              return (
                <Link
                  key={g ?? "all"}
                  href={filterHref(g)}
                  className={cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }), "min-h-9 rounded-full")}
                >
                  {t(`tab_${g ?? "all"}`)}
                </Link>
              );
            })}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {filteredFiles.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{params.filter || params.q ? t("noFilesForFilter") : t("noFiles")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>{t("tableFile")}</TableHead>
                      <TableHead>{t("tableSource")}</TableHead>
                      <TableHead>{t("tableDate")}</TableHead>
                      <TableHead>{t("tableStatus")}</TableHead>
                      <TableHead className="w-28">{t("tableOpen")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFiles.map((f) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{f.name}</p>
                                {f.isNew && (
                                  <Badge variant="secondary" className="bg-accent/15 text-accent">
                                    {t("newBadge")}
                                  </Badge>
                                )}
                              </div>
                              {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.sourceLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <span dir="ltr">{formatDate(f.date, locale)}</span>
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-lg px-2.5 py-1 text-xs font-bold", f.statusTone)}>{f.statusLabel}</span>
                        </TableCell>
                        <TableCell>
                          {f.openHref ? (
                            <a
                              href={f.openHref}
                              target={f.source === "faculty" ? "_blank" : undefined}
                              rel={f.source === "faculty" ? "noreferrer" : undefined}
                              className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-1.5 rounded-lg")}
                            >
                              <Eye className="size-3.5" />
                              {t("tableOpen")}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
