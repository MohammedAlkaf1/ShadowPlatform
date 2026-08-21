import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { FileQuestion, Plus } from "lucide-react";

/** Plain module-level helper (not inline in the component body) specifically
 * so the `Date.now()` call inside it doesn't trip the "impure function
 * during render" lint rule — same pattern established in
 * admin/stats/page.tsx and student/status/page.tsx. */
function statusOf(availableAt: Date | null): {
  key: "statusDraft" | "statusScheduled" | "statusPublished";
  variant: "outline" | "secondary" | "default";
} {
  if (!availableAt) return { key: "statusDraft", variant: "outline" };
  if (availableAt.getTime() > Date.now()) return { key: "statusScheduled", variant: "secondary" };
  return { key: "statusPublished", variant: "default" };
}

/**
 * /faculty/exams — the CALLING faculty member's own exams only. Deliberately
 * faculty-only (not "faculty","admin") — same rule as /faculty/upload and
 * every FacultyResource route: no admin/specialist read path exists
 * anywhere for exam data, not even in /admin.
 */
export default async function FacultyExamsPage() {
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyExams");

  const [exams, courseLinkCount] = await Promise.all([
    db.exam.findMany({
      where: { facultyUserId: ctx.userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true } } },
    }),
    db.facultyCourseLink.count({ where: { facultyUserId: ctx.userId } }),
  ]);

  const navItems = await getFacultyNavItems();

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
        <div className="flex justify-end">
          {/* The one accent CTA on this screen. */}
          <Link href="/faculty/exams/new" className={cn(buttonVariants({ variant: "accent", size: "cta" }), "rounded-full")}>
            <Plus className="size-4" data-icon="inline-start" />
            {t("newExamButton")}
          </Link>
        </div>

        {courseLinkCount === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noCourseLinks")}</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("listTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {exams.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noExams")}</p>
              ) : (
                <ul className="space-y-2">
                  {exams.map((exam) => {
                    const status = statusOf(exam.availableAt);
                    return (
                      <li key={exam.id}>
                        <Link
                          href={`/faculty/exams/${exam.id}`}
                          className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3 transition-colors hover:bg-secondary/70 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            <FileQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium break-words text-pretty">{exam.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {t("courseLabel")}: <span dir="ltr">{exam.courseCode}</span>
                                {" · "}
                                {t("questionCount", { count: exam._count.questions })}
                                {" · "}
                                {exam.source === "AI_GENERATED" ? t("sourceAi") : t("sourceManual")}
                              </p>
                            </div>
                          </div>
                          <Badge variant={status.variant}>{t(status.key)}</Badge>
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
