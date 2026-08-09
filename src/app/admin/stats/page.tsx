import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryChart } from "./category-chart";

export default async function AdminStatsPage() {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminStats");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();

  function formatDuration(ms: number): string {
    const days = ms / (1000 * 60 * 60 * 24);
    if (days < 1) return `${(ms / (1000 * 60 * 60)).toFixed(1)} ${t("hours")}`;
    return `${days.toFixed(1)} ${t("days")}`;
  }

  const [students, categories, supportLevels, allAssessments] = await Promise.all([
    db.studentProfile.findMany({
      where: { deletedAt: null },
      select: { id: true, requestStatus: true, createdAt: true },
    }),
    db.category.findMany({ select: { id: true, nameAr: true, nameEn: true } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" }, select: { id: true, nameAr: true, order: true } }),
    db.assessment.findMany({
      select: {
        studentProfileId: true,
        createdAt: true,
        condition: { select: { categoryId: true } },
        supportLevelId: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // Latest classification per student (a student may have been reassessed
  // over time — "count per category/level" reads as their CURRENT one).
  const latestByStudent = new Map<string, (typeof allAssessments)[number]>();
  for (const a of allAssessments) {
    latestByStudent.set(a.studentProfileId, a); // assessments are ordered asc, so last write wins = latest
  }

  const categoryCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  for (const a of latestByStudent.values()) {
    categoryCounts.set(a.condition.categoryId, (categoryCounts.get(a.condition.categoryId) ?? 0) + 1);
    levelCounts.set(a.supportLevelId, (levelCounts.get(a.supportLevelId) ?? 0) + 1);
  }

  const categoryChartData = categories.map((c) => ({
    name: locale === "en" ? c.nameEn : c.nameAr,
    count: categoryCounts.get(c.id) ?? 0,
  }));

  const pendingCount = students.filter((s) => s.requestStatus === "pending").length;
  const underReviewCount = students.filter((s) => s.requestStatus === "under_review").length;

  // Average time-to-review: registration (StudentProfile.createdAt) to the
  // FIRST assessment ever recorded for that student.
  const firstAssessmentByStudent = new Map<string, Date>();
  for (const a of allAssessments) {
    if (!firstAssessmentByStudent.has(a.studentProfileId)) {
      firstAssessmentByStudent.set(a.studentProfileId, a.createdAt);
    }
  }
  const studentById = new Map(students.map((s) => [s.id, s]));
  const reviewDurationsMs: number[] = [];
  for (const [studentId, firstAssessedAt] of firstAssessmentByStudent) {
    const student = studentById.get(studentId);
    if (!student) continue;
    reviewDurationsMs.push(firstAssessedAt.getTime() - student.createdAt.getTime());
  }
  const avgReviewMs =
    reviewDurationsMs.length > 0 ? reviewDurationsMs.reduce((a, b) => a + b, 0) / reviewDurationsMs.length : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("totalStudents")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{students.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("pending")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("underReview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{underReviewCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("avgReviewTime")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">
              {avgReviewMs === null ? "—" : formatDuration(avgReviewMs)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("byCategory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryChart data={categoryChartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("bySupportLevel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-3">
            {supportLevels.map((lvl) => (
              <li key={lvl.id} className="rounded-md border border-border bg-secondary/40 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{levelCounts.get(lvl.id) ?? 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tSupportLevel(String(lvl.order))}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
