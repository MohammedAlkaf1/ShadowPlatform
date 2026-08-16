import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EchoCard } from "@/components/ui/echo-card";
import { CheckCircle2, Download, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getStudentNavItems } from "@/components/layout/nav-items";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  under_review: "bg-accent/15 text-accent",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
};

const NEW_BADGE_WINDOW_DAYS = 3;

// Wrapped in its own function (rather than inlining `Date.now()` directly
// in the page component's body) so this server component's async render
// function doesn't trip the "impure function during render" lint rule,
// which flags bare Date.now()/Math.random() calls lexically inside a
// component regardless of it being a dynamic server component that's
// expected to read wall-clock time per-request.
function newBadgeCutoffDate(): Date {
  return new Date(Date.now() - NEW_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export default async function StudentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentStatus");
  const tRequestStatus = await getTranslations("Common.requestStatus");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const locale = await getLocale();
  const params = await searchParams;

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });

  // IMPORTANT: students never see their classification/category, support
  // level, specialist notes, or medical report contents — anywhere, by
  // design. This page only ever reads requestStatus + the enabled tool list
  // from an APPROVED support plan; it never touches Assessment or the
  // Document's contents.
  const approvedPlan = studentProfile
    ? await db.supportPlan.findFirst({
        where: { studentProfileId: studentProfile.id, status: "approved" },
        orderBy: { approvedAt: "desc" },
        include: { toolActivations: { where: { enabled: true } } },
      })
    : null;

  // "Date the plan was last updated" — SupportPlan has no updatedAt column
  // in the schema, so this is computed (not stored) as the most recent of:
  // when the plan was created/approved, or its latest level revision. No
  // reason/detail from that revision is ever read here, only the timestamp.
  let planLastUpdated: Date | null = null;
  if (approvedPlan) {
    const latestRevision = await db.planRevision.findFirst({
      where: { supportPlanId: approvedPlan.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const candidates = [approvedPlan.createdAt, approvedPlan.approvedAt, latestRevision?.createdAt].filter(
      (d): d is Date => d !== null && d !== undefined
    );
    planLastUpdated = candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
  }

  const requestStatus = studentProfile?.requestStatus ?? "pending";
  const statusTone = STATUS_TONE[requestStatus] ?? STATUS_TONE.pending;

  // Batch 3: the old /student/documents page (own uploads only) and the
  // faculty-resources section that used to live on this page are unified
  // into ONE filterable file table, matching the mockup's "لوحتي" screen.
  // Same two data sources, same scoping as before (own studentProfileId
  // for both) — this is a presentation merge, not a permissions change.
  const facultyResources = studentProfile
    ? await db.facultyResource.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { email: true, fullName: true } } },
      })
    : [];
  const documents = studentProfile
    ? await db.document.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, originalFilename: true, createdAt: true, status: true },
      })
    : [];
  const newBadgeCutoff = newBadgeCutoffDate();

  type UnifiedFile = {
    id: string;
    name: string;
    sourceLabel: string;
    date: Date;
    statusLabel: string;
    source: "mine" | "faculty";
    downloadHref: string | null;
    isNew: boolean;
    note?: string;
  };

  const unifiedFiles: UnifiedFile[] = [
    ...documents.map(
      (d): UnifiedFile => ({
        id: d.id,
        name: d.originalFilename,
        sourceLabel: t("sourceMe"),
        date: d.createdAt,
        statusLabel: tDocumentStatus(d.status === "reviewed" ? "reviewed" : "pending"),
        source: "mine",
        // Students have no download route for their own uploaded medical
        // document today (GET /api/documents/:id is specialist/admin-only
        // — see that route's own comment). Not adding one here: this batch
        // is a presentation restructuring, not new access, so the row
        // simply has no "open" action, matching current real capability.
        downloadHref: null,
        isNew: false,
      })
    ),
    ...facultyResources.map(
      (r): UnifiedFile => ({
        id: r.id,
        name: r.title,
        sourceLabel: r.uploadedBy.fullName,
        date: r.createdAt,
        statusLabel: tDocumentStatus("reviewed"),
        source: "faculty",
        downloadHref: `/api/student/faculty-resources/${r.id}/download`,
        isNew: r.createdAt >= newBadgeCutoff,
        note: r.note ?? undefined,
      })
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const filteredFiles =
    params.filter === "mine"
      ? unifiedFiles.filter((f) => f.source === "mine")
      : params.filter === "faculty"
        ? unifiedFiles.filter((f) => f.source === "faculty")
        : unifiedFiles;

  const navItems = await getStudentNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
    <div className="mx-auto max-w-3xl space-y-6">

      {/* Hero row: the one EchoCard on this page wraps the request-status
          card — the single most relevant card here. No forced bento "huge
          number" — a request status is not a genuine metric, and inventing
          one (e.g. a fake "days waiting" counter) would be exactly the
          hollow-stat pattern we were told to avoid. When an approved plan
          exists, a small plain (non-echo) side card shows the one real
          number available on this page: the count of enabled tools. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <EchoCard className="sm:flex-[1.6]">
          <Card className="h-full justify-between rounded-[24px]">
            <CardHeader>
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">{t("heroTag")}</p>
              <CardTitle className="text-base font-medium text-muted-foreground">
                {t("requestStatusTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Badge className={statusTone} variant="secondary">
                {tRequestStatus(requestStatus)}
              </Badge>
              <p className="text-sm text-muted-foreground">{t("heroDescription")}</p>
              {!studentProfile?.verified && (
                <p className="text-sm text-muted-foreground">{t("verificationPending")}</p>
              )}
            </CardContent>
          </Card>
        </EchoCard>

        {approvedPlan && (
          <Card className="sm:w-56 sm:shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("toolsCountStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{approvedPlan.toolActivations.length}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("toolsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {approvedPlan && planLastUpdated && (
            <p className="mb-4 text-xs text-muted-foreground" dir="ltr">
              {t("planLastUpdated")}: {formatDate(planLastUpdated, locale)}
            </p>
          )}
          {!approvedPlan || approvedPlan.toolActivations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noTools")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {approvedPlan.toolActivations.map((tool) => {
                const meta = TOOL_CODE_LABELS[tool.toolCode as ToolCodeValue];
                return (
                  <li
                    key={tool.id}
                    className="flex items-start gap-2 rounded-md border border-border bg-secondary/50 p-3"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {meta ? (locale === "en" ? meta.en : meta.ar) : tool.toolCode}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meta ? (locale === "en" ? meta.descriptionEn : meta.description) : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">
              {t("filesTableTitle")} ({filteredFiles.length})
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("filesTableSubtitle")}</p>
          </div>
          {/* No screen-level accent action here — "Upload a document" is
              already the sidebar nav's own action (see student layout.tsx),
              so repeating it as a second terracotta button on this screen
              would violate the one-accent-per-screen rule for no benefit. */}
          <form method="GET" className="flex items-center gap-2">
            <select
              name="filter"
              defaultValue={params.filter ?? ""}
              className="flex h-11 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("filterAll")}</option>
              <option value="mine">{t("filterMine")}</option>
              <option value="faculty">{t("filterFaculty")}</option>
            </select>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              {t("filterButton")}
            </button>
          </form>
        </CardHeader>
        <CardContent>
          {filteredFiles.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {params.filter ? t("noFilesForFilter") : t("noFiles")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      {/* text-start with dir="ltr" — see admin/audit-log/page.tsx. */}
                      <TableCell dir="ltr" className="text-start text-sm text-muted-foreground">
                        {formatDate(f.date, locale)}
                      </TableCell>
                      <TableCell className="text-sm">{f.statusLabel}</TableCell>
                      <TableCell>
                        {f.downloadHref ? (
                          <a
                            href={f.downloadHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <Download className="size-3.5" />
                            {t("downloadButton")}
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

      {/* Hidden note: reuses the exact reasoning already documented above
          the approvedPlan query — students never see their own
          classification/category, support level, specialist notes, or
          medical report contents, anywhere on this page or elsewhere. */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
    </AppShell>
  );
}
