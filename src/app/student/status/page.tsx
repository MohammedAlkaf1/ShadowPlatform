import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, FileText } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  under_review: "bg-accent/15 text-accent",
  approved: "bg-emerald-100 text-emerald-800",
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

export default async function StudentStatusPage() {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentStatus");
  const tRequestStatus = await getTranslations("Common.requestStatus");
  const locale = await getLocale();

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

  // Faculty-uploaded custom resources — student sees only their own, and
  // this section is omitted ENTIRELY (not shown-but-empty) when there are
  // none, so its absence never reads as "you have zero" versus "doesn't
  // apply to you" — same non-distinguishing-empty-state principle as the
  // rest of this page.
  const facultyResources = studentProfile
    ? await db.facultyResource.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { email: true } } },
      })
    : [];
  const newBadgeCutoff = newBadgeCutoffDate();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("requestStatusTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge className={statusTone} variant="secondary">
            {tRequestStatus(requestStatus)}
          </Badge>
          {!studentProfile?.verified && (
            <p className="mt-3 text-sm text-muted-foreground">{t("verificationPending")}</p>
          )}
        </CardContent>
      </Card>

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

      {facultyResources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("facultyResourcesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {facultyResources.map((resource) => {
                const isNew = resource.createdAt >= newBadgeCutoff;
                return (
                  <li key={resource.id} className="rounded-md border border-border bg-secondary/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-accent" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{resource.title}</p>
                            {isNew && (
                              <Badge variant="secondary" className="bg-accent/15 text-accent">
                                {t("newBadge")}
                              </Badge>
                            )}
                          </div>
                          {resource.category && (
                            <p className="text-xs text-muted-foreground">
                              {t.has(`resourceCategory.${resource.category}`)
                                ? t(`resourceCategory.${resource.category}`)
                                : resource.category}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {resource.uploadedBy.email} — {formatDate(resource.createdAt, locale)}
                          </p>
                          {resource.note && <p className="mt-1 text-sm text-foreground">{resource.note}</p>}
                          {isNew && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("newResourceNotice", { course: resource.courseCode })}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={`/api/student/faculty-resources/${resource.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        <Download className="size-3.5" />
                        {t("downloadButton")}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
