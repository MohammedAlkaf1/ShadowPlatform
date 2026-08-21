import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { formatDateTime } from "@/lib/format-date";
import { PublishButton } from "./publish-button";

/** Plain module-level helper so the `Date.now()` call doesn't trip the
 * "impure function during render" lint rule — same pattern as
 * /faculty/exams/page.tsx's statusOf. */
function statusOf(availableAt: Date | null): {
  key: "statusDraft" | "statusScheduled" | "statusPublished";
  variant: "outline" | "secondary" | "default";
} {
  if (!availableAt) return { key: "statusDraft", variant: "outline" };
  if (availableAt.getTime() > Date.now()) return { key: "statusScheduled", variant: "secondary" };
  return { key: "statusPublished", variant: "default" };
}

/**
 * /faculty/exams/:id — read-only detail view of the CALLING faculty
 * member's own exam, including which option is correct for each question
 * (this is the authoring view; students never reach this route — see
 * GET /api/exams/:id/questions for their withheld-isCorrect view instead).
 * Not found (never 403) for any exam this faculty member doesn't own, same
 * "don't confirm existence" posture as the rest of this codebase's
 * per-owner resources.
 */
export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyExams");
  const locale = await getLocale();

  const exam = await db.exam.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" }, include: { options: { orderBy: { order: "asc" } } } } },
  });

  if (!exam || exam.deletedAt || exam.facultyUserId !== ctx.userId) {
    notFound();
  }

  const navItems = await getFacultyNavItems();
  const status = statusOf(exam.availableAt);

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={exam.title}
      subtitle={`${t("courseLabel")}: ${exam.courseCode}`}
    >
      <div className="space-y-5">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={status.variant}>{t(status.key)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t("createdAt")} <span dir="ltr">{formatDateTime(exam.createdAt, locale)}</span>
              </span>
            </div>
            {!exam.availableAt && <PublishButton examId={exam.id} />}
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("questionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {exam.questions.map((q, index) => (
              <div key={q.id} className="space-y-2 rounded-md border border-border p-3">
                <p className="text-sm font-medium text-pretty">
                  {index + 1}. {q.text}
                </p>
                <ul className="space-y-1">
                  {q.options.map((o) => (
                    <li
                      key={o.id}
                      className="flex items-center gap-2 text-sm text-pretty"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${o.isCorrect ? "bg-primary" : "bg-muted-foreground/30"}`}
                      />
                      <span className={o.isCorrect ? "font-medium text-foreground" : "text-muted-foreground"}>
                        {o.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
