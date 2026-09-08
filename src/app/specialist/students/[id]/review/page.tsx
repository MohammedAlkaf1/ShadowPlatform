import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { formatDate } from "@/lib/format-date";
import { localize } from "@/lib/localize";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";
import { InfoTab } from "./info-tab";
import { DocumentsTab } from "./documents-tab";
import { PlanTab } from "./plan-tab";
import { ChevronLeft } from "lucide-react";
import type { ToolCodeValue } from "@/lib/tool-codes";
import type { RequestStatus } from "@prisma/client";

const TABS = ["info", "documents", "plan"] as const;
type Tab = (typeof TABS)[number];

/**
 * Case File view — replaces the old "مراجعة وثيقة" single-scroll screen
 * (long checkbox list, no tabs) with the 3-tab layout: student info +
 * internal assessment, documents, support plan. Reached exclusively via the
 * queue table's single "مراجعة" action now (the separate "تفاصيل" page/
 * route this used to link to is gone — its real content is folded into the
 * "معلومات الطالب" tab below).
 */
const DOCS_PAGE_SIZE = 5;

export default async function CaseFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; docPage?: string }>;
}) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistReview");
  const tDocumentStatus = await getTranslations("Common.documentStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();
  const { tab: tabParam, docPage: docPageParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "info";
  const docPage = Math.max(1, Number(docPageParam) || 1);

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true, fullName: true, fullNameEn: true } } },
  });
  if (!student) notFound();
  const studentName = localize(student.user.fullName, student.user.fullNameEn, locale);

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
    db.document.findMany({
      where: { studentProfileId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, originalFilename: true, originalFilenameEn: true, createdAt: true, status: true },
    }),
  ]);

  const documentsLocalized = documents.map((d) => ({
    ...d,
    originalFilename: localize(d.originalFilename, d.originalFilenameEn, locale),
  }));

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
        initialConfigs: Object.fromEntries(
          planRaw.toolActivations.map((ta) => [ta.toolCode, (ta.config ?? {}) as { courses?: string; startDate?: string; visible?: string }])
        ) as Record<ToolCodeValue, { courses?: string; startDate?: string; visible?: string }>,
      }
    : null;

  const STATUS_LABEL: Record<RequestStatus, string> = {
    pending: t("statusPending"),
    under_review: t("statusPending"),
    approved: t("statusDone"),
    rejected: t("statusReturned"),
  };

  const navItems = await getSpecialistNavItems();

  function tabHref(tb: Tab) {
    return tb === "info" ? `/specialist/students/${studentProfileId}/review` : `/specialist/students/${studentProfileId}/review?tab=${tb}`;
  }

  const totalDocuments = documentsLocalized.length;
  const totalDocPages = Math.max(1, Math.ceil(totalDocuments / DOCS_PAGE_SIZE));
  const currentDocPage = Math.min(docPage, totalDocPages);
  const pagedDocuments = documentsLocalized.slice((currentDocPage - 1) * DOCS_PAGE_SIZE, currentDocPage * DOCS_PAGE_SIZE);

  function docPageHref(targetPage: number) {
    return `/specialist/students/${studentProfileId}/review?tab=documents&docPage=${targetPage}`;
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
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/specialist/queue"
            className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-[15px] rtl:rotate-180" />
            {t("casesBreadcrumb")}
          </Link>
          <span className="text-xl font-extrabold text-foreground">{studentName}</span>
          <span className="size-[5px] shrink-0 rounded-full bg-muted-foreground" />
          <span className="text-[13px] font-bold text-accent">{STATUS_LABEL[student.requestStatus]}</span>
        </div>

        <div className="flex gap-0.5 border-b border-border">
          {TABS.map((tb) => (
            <Link
              key={tb}
              href={tabHref(tb)}
              className={cn(
                "-mb-px flex min-h-11 items-center border-b-[2.5px] px-[18px] text-sm font-bold",
                tb === tab ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`tab_${tb}`)}
            </Link>
          ))}
        </div>

        {tab === "info" && (
          <InfoTab
            fields={[
              { label: t("fieldName"), value: studentName },
              { label: t("fieldStudentNumber"), value: student.studentNumber || "—" },
              { label: t("fieldMajor"), value: localize(student.major, student.majorEn, locale) },
              { label: t("fieldStage"), value: localize(student.academicStage, student.academicStageEn, locale) },
              // No "academic advisor" field exists anywhere in this schema
              // (StudentProfile has no advisor relation/column) — shown as
              // "—" rather than invented, same as every other missing-data
              // case this session.
              { label: t("fieldAdvisor"), value: "—" },
              { label: t("fieldRequestDate"), value: formatDate(student.createdAt, locale) },
            ]}
            studentProfileId={studentProfileId}
            categories={categories}
            supportLevels={supportLevels}
            latestAssessment={latestAssessment}
          />
        )}

        {tab === "documents" && (
          <DocumentsTab
            documents={pagedDocuments}
            locale={locale}
            labels={{
              tableName: t("tableFile"),
              tableDate: t("tableUploadDate"),
              tableStatus: t("tableStatus"),
              tableAction: t("openButton"),
              reviewed: tDocumentStatus("reviewed"),
              pending: tDocumentStatus("pending"),
              needsUpdate: tDocumentStatus("needs_update"),
              viewButton: t("openButton"),
              noDocuments: t("noDocuments"),
            }}
            pagination={
              totalDocuments > 0
                ? {
                    prevHref: currentDocPage > 1 ? docPageHref(currentDocPage - 1) : null,
                    nextHref: currentDocPage < totalDocPages ? docPageHref(currentDocPage + 1) : null,
                    showingLabel: t("docsShowingCount", {
                      from: (currentDocPage - 1) * DOCS_PAGE_SIZE + 1,
                      to: Math.min(currentDocPage * DOCS_PAGE_SIZE, totalDocuments),
                      total: totalDocuments,
                    }),
                  }
                : null
            }
          />
        )}

        {tab === "plan" && (
          <PlanTab
            studentProfileId={studentProfileId}
            supportLevels={supportLevels}
            latestAssessmentId={latestAssessment?.id ?? null}
            plan={plan}
          />
        )}
      </div>
    </AppShell>
  );
}
