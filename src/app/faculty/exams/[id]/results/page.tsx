import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { formatDateTime } from "@/lib/format-date";
import { ArrowRight } from "lucide-react";

/**
 * /faculty/exams/:id/results — the CALLING faculty member's own exam's
 * submissions: student name, submission time, score, status. Same
 * ownership rule as /faculty/exams/:id (not found, never 403, for an exam
 * this faculty member doesn't own). Default sort newest-submitted-first —
 * mirrors GET /api/faculty/exams/:id/results's own ordering, so this page
 * does no client-side re-sorting of what the API already returns sorted.
 */
export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyExams");
  const locale = await getLocale();

  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam || exam.deletedAt || exam.facultyUserId !== ctx.userId) {
    notFound();
  }

  const totalQuestions = await db.question.count({ where: { examId: id } });

  const submissions = await db.examSubmission.findMany({
    where: { examId: id },
    orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
    include: {
      student: { select: { fullName: true, email: true } },
      answers: { select: { selectedOption: { select: { isCorrect: true } } } },
    },
  });

  const navItems = await getFacultyNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("resultsTitle")}
      subtitle={exam.title}
    >
      <div className="space-y-5">
        <Link
          href={`/faculty/exams/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="size-4 rtl:rotate-180" />
          {t("backToExam")}
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("resultsListTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {submissions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("noSubmissionsYet")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("resultsStudentColumn")}</TableHead>
                    <TableHead>{t("resultsSubmittedAtColumn")}</TableHead>
                    <TableHead>{t("resultsScoreColumn")}</TableHead>
                    <TableHead>{t("tableStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-normal break-words">
                        <p>{s.student.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          <span dir="ltr">{s.student.email}</span>
                        </p>
                      </TableCell>
                      <TableCell>
                        {s.completedAt ? (
                          <span dir="ltr">{formatDateTime(s.completedAt, locale)}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("resultsNotSubmittedYet")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {s.score !== null ? (
                          <span dir="ltr">
                            {s.answers.filter((a) => a.selectedOption?.isCorrect === true).length}/{totalQuestions} (
                            {s.score.toFixed(0)}%)
                          </span>
                        ) : s.status === "completed" ? (
                          // Legacy data from before ExamSubmission.score existed
                          // (submissions completed prior to this column being
                          // added) — never silently blank, always labeled.
                          <span className="text-muted-foreground">{t("resultsScoreUnavailable")}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "completed" ? "default" : "secondary"}>
                          {s.status === "completed" ? t("resultsStatusCompleted") : t("resultsStatusInProgress")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
