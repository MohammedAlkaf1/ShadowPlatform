import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { localize } from "@/lib/localize";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { ClipboardList, Plus, Search } from "lucide-react";

/** Plain module-level helper (not inline in the component body) specifically
 * so the `Date.now()` call inside it doesn't trip the "impure function
 * during render" lint rule — same pattern established in
 * admin/stats/page.tsx and student/status/page.tsx. */
function statusOf(availableAt: Date | null): {
  key: "statusDraft" | "statusScheduled" | "statusPublished";
  tone: string;
} {
  if (!availableAt) return { key: "statusDraft", tone: "bg-muted text-muted-foreground" };
  if (availableAt.getTime() > Date.now())
    return { key: "statusScheduled", tone: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-400" };
  return { key: "statusPublished", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400" };
}

/**
 * /faculty/exams — the CALLING faculty member's own exams only. Deliberately
 * faculty-only (not "faculty","admin") — same rule as /faculty/upload and
 * every FacultyResource route: no admin/specialist read path exists
 * anywhere for exam data, not even in /admin.
 */
export default async function FacultyExamsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyExams");
  const locale = await getLocale();
  const params = await searchParams;

  const [exams, courseLinkCount] = await Promise.all([
    db.exam.findMany({
      where: { facultyUserId: ctx.userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true } } },
    }),
    db.facultyCourseLink.count({ where: { facultyUserId: ctx.userId } }),
  ]);

  const statusTab = params.status === "published" || params.status === "draft" ? params.status : null;

  let filteredExams = exams;
  if (statusTab) {
    filteredExams = filteredExams.filter((exam) => statusOf(exam.availableAt).key === `status${statusTab === "published" ? "Published" : "Draft"}`);
  }
  if (params.q) {
    const q = params.q.trim().toLowerCase();
    filteredExams = filteredExams.filter(
      (exam) => exam.title.toLowerCase().includes(q) || exam.courseCode.toLowerCase().includes(q)
    );
  }

  function tabHref(tab: "published" | "draft" | null) {
    const qs = new URLSearchParams();
    if (tab) qs.set("status", tab);
    if (params.q) qs.set("q", params.q);
    const s = qs.toString();
    return s ? `/faculty/exams?${s}` : "/faculty/exams";
  }

  const navItems = await getFacultyNavItems();

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
        {/* Single row, vertically centered — the action button and the
            search+filter group must sit on the same line, not stack with a
            gap between them. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The one accent CTA on this screen. */}
          <Link href="/faculty/exams/new" className={cn(buttonVariants({ variant: "accent", size: "cta" }), "rounded-full")}>
            <Plus className="size-4" data-icon="inline-start" />
            {t("newExamButton")}
          </Link>

          {courseLinkCount > 0 && (
            <div className="flex flex-wrap items-center gap-2.5">
              <form method="GET" className="relative min-w-[200px] max-w-[330px] flex-1">
                {statusTab && <input type="hidden" name="status" value={statusTab} />}
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
                {(["all", "published", "draft"] as const).map((tab) => {
                  const active = tab === "all" ? !statusTab : statusTab === tab;
                  return (
                    <Link
                      key={tab}
                      href={tabHref(tab === "all" ? null : tab)}
                      className={cn(
                        buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                        "min-h-9 rounded-lg"
                      )}
                    >
                      {tab === "all" ? t("tabAll") : tab === "published" ? t("statusPublished") : t("statusDraft")}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {courseLinkCount === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noCourseLinks")}</CardContent>
          </Card>
        ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">{t("listTitle")}</CardTitle>
                <span className="rounded-full bg-foreground/[.08] px-[9px] py-[3px] text-[11.5px] font-bold text-muted-foreground">
                  {filteredExams.length} / {exams.length}
                </span>
              </CardHeader>
              <CardContent>
                {filteredExams.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {exams.length === 0 ? t("noExams") : t("noMatchingExams")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {filteredExams.map((exam) => {
                      const status = statusOf(exam.availableAt);
                      return (
                        <li key={exam.id}>
                          <Link
                            href={`/faculty/exams/${exam.id}`}
                            className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3 transition-colors hover:bg-secondary/70 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[.08] text-foreground">
                                <ClipboardList className="size-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-medium break-words text-pretty">
                                  {localize(exam.title, exam.titleEn, locale)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {t("courseLabel")}: <span dir="ltr">{exam.courseCode}</span>
                                  {" · "}
                                  {t("questionCount", { count: exam._count.questions })}
                                  {" · "}
                                  {exam.source === "AI_GENERATED" ? t("sourceAi") : t("sourceManual")}
                                </p>
                              </div>
                            </div>
                            <Badge variant="secondary" className={status.tone}>
                              {t(status.key)}
                            </Badge>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
        )}
      </div>
    </AppShell>
  );
}
