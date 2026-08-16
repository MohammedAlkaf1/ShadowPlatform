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
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";

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

  const navItems = await getSpecialistNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={student.user.fullName}
    >
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-foreground">{student.user.fullName}</p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {student.user.email}
          </p>
        </div>
        <Link href={`/specialist/students/${studentProfileId}`} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("fullHistoryButton")}
        </Link>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Document-info panel: the one EchoCard on this screen. flex-[1.7]
            matches the reference file's isDoc layout ratio exactly (its
            hero-row dashboard cards use 1.6; this document-review screen
            uses 1.7 for its doc-info panel specifically). */}
        <EchoCard className="lg:flex-[1.7]">
          <Card className="h-full rounded-[24px]">
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
              {/* h-[220px]: closer to the reference file's 280px preview
                  box height (kept full-width rather than a fixed 216px, so
                  it reads correctly at any card width instead of just the
                  mock's fixed 1440px canvas). rounded-[16px] rather than
                  the default rounded-lg to match the reference's document-
                  facts card corner treatment. */}
              <div className="flex h-[220px] items-center justify-center rounded-[16px] border border-dashed border-border bg-muted/40 text-center text-xs text-muted-foreground">
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
                          <p className="text-pretty text-sm font-medium">{doc.originalFilename}</p>
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
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
    </AppShell>
  );
}
