import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EchoCard } from "@/components/ui/echo-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { ReviewForm } from "./review-form";
import type { ToolCodeValue } from "@/lib/tool-codes";

/**
 * Batch 3: the assess and plan screens merged into ONE "مراجعة وثيقة"
 * document-review screen, reached by clicking a queue row (see
 * /specialist/queue's "review"/"assess" links, and the old /assess and
 * /plan routes, which now just redirect here — see their page.tsx files).
 */
export default async function ReviewStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistReview");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!student) notFound();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_student_profile",
    resourceType: "StudentProfile",
    resourceId: studentProfileId,
    targetStudentProfileId: studentProfileId,
  });

  const [categoriesRaw, supportLevelsRaw, latestAssessmentRaw, documents] = await Promise.all([
    db.category.findMany({ include: { conditions: true }, orderBy: { nameAr: "asc" } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
    db.assessment.findFirst({
      where: { studentProfileId },
      orderBy: { assessedAt: "desc" },
      include: { condition: { include: { category: true } }, supportLevel: true },
    }),
    // Same download route the specialist detail page already uses
    // (GET /api/documents/:id — specialist/admin-only, audit-logged per
    // open). Only the 5 most recent are shown here; the full history is
    // still on /specialist/students/[id].
    db.document.findMany({
      where: { studentProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, originalFilename: true, createdAt: true, status: true },
    }),
  ]);

  const categories = categoriesRaw.map((c) => ({
    id: c.id,
    name: locale === "en" ? c.nameEn : c.nameAr,
    conditions: c.conditions.map((cond) => ({
      id: cond.id,
      name: locale === "en" ? cond.nameEn : cond.nameAr,
    })),
  }));
  const supportLevels = supportLevelsRaw.map((l) => ({
    id: l.id,
    name: tSupportLevel(String(l.order)),
    order: l.order,
  }));

  const latestAssessment = latestAssessmentRaw
    ? {
        id: latestAssessmentRaw.id,
        categoryName:
          locale === "en" ? latestAssessmentRaw.condition.category.nameEn : latestAssessmentRaw.condition.category.nameAr,
        conditionName: locale === "en" ? latestAssessmentRaw.condition.nameEn : latestAssessmentRaw.condition.nameAr,
        supportLevelName: tSupportLevel(String(latestAssessmentRaw.supportLevel.order)),
        notes: latestAssessmentRaw.notes,
      }
    : null;

  const planRaw = latestAssessmentRaw
    ? await db.supportPlan.findFirst({
        where: { assessmentId: latestAssessmentRaw.id },
        include: { toolActivations: { where: { enabled: true } } },
      })
    : null;
  const plan = planRaw
    ? {
        id: planRaw.id,
        status: planRaw.status,
        initialEnabledCodes: planRaw.toolActivations.map((ta) => ta.toolCode) as ToolCodeValue[],
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
          <p className="mt-1 text-base font-semibold text-foreground">{student.user.fullName}</p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {student.user.email}
          </p>
        </div>
        <Link href={`/specialist/students/${studentProfileId}`} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("fullHistoryButton")}
        </Link>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Document-info panel: the one EchoCard on this screen. */}
        <EchoCard className="lg:flex-[1.6]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-base">{t("documentsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Preview placeholder — matches the mockup's visual treatment
                  exactly ("document preview served from secure storage").
                  Real PDF rendering is out of scope for this batch; the
                  actual open/download affordance below each row already
                  reuses the real GET /api/documents/:id route (commit
                  fac6a48), so nothing about document access regresses. */}
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-center text-xs text-muted-foreground">
                {t("previewPlaceholder")}
              </div>
              {documents.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{doc.originalFilename}</p>
                          <p dir="ltr" className="text-start text-xs text-muted-foreground">
                            {formatDate(doc.createdAt, locale)} ·{" "}
                            {tDocumentStatus(doc.status === "reviewed" ? "reviewed" : "pending")}
                          </p>
                        </div>
                      </div>
                      <a
                        href={`/api/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}
                      >
                        {t("openButton")}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </EchoCard>

        <Card className="lg:flex-1">
          <CardHeader>
            <CardTitle className="text-base">{t("classifyTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("classifySub")}</p>
          </CardHeader>
          <CardContent>
            <ReviewForm
              studentProfileId={studentProfileId}
              categories={categories}
              supportLevels={supportLevels}
              latestAssessment={latestAssessment}
              plan={plan}
            />
          </CardContent>
        </Card>
      </div>

      {/* Hidden note: real boundary — this screen (classification, plan
          approval) is visible only to the specialist assigned to this
          student (or an admin, who has university-wide access but no
          classify/approve UI of their own elsewhere). */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
  );
}
