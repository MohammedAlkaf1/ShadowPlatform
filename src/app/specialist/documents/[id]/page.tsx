import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { formatRelativeDay } from "@/lib/format-date";
import { localize } from "@/lib/localize";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";
import { buttonVariants } from "@/components/ui/button";
import { DocumentClassifyForm } from "./classify-form";
import { FileText } from "lucide-react";

/**
 * Standalone per-document review screen (the sidebar's "مراجعة وثيقة"
 * destination) — a two-column layout: the document's own metadata + a link
 * to open it (right column), and the real classification form used to
 * create the student's Assessment (left column), reusing the exact same
 * createAssessment server action as the case-file's "معلومات الطالب" tab.
 */
export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistDocuments");
  const locale = await getLocale();

  const document = await db.document.findUnique({
    where: { id: documentId },
    include: { studentProfile: { include: { user: { select: { fullName: true, fullNameEn: true } } } } },
  });
  if (!document || document.deletedAt) notFound();

  await assertSpecialistAssigned(ctx, document.studentProfileId);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_document",
    resourceType: "Document",
    resourceId: documentId,
    targetStudentProfileId: document.studentProfileId,
  });

  const [categoriesRaw, supportLevelsRaw] = await Promise.all([
    db.category.findMany({ include: { conditions: true }, orderBy: { nameAr: "asc" } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
  ]);

  const categories = categoriesRaw.map((c) => ({
    id: c.id,
    name: locale === "en" ? c.nameEn : c.nameAr,
    conditions: c.conditions.map((cond) => ({ id: cond.id, name: locale === "en" ? cond.nameEn : cond.nameAr })),
  }));
  const supportLevels = supportLevelsRaw.map((l) => ({ id: l.id, order: l.order }));

  const studentName = localize(document.studentProfile.user.fullName, document.studentProfile.user.fullNameEn, locale);
  const navItems = await getSpecialistNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title", { name: studentName })}
      subtitle=""
    >
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <span
            className={cn(
              "inline-flex w-fit rounded-lg px-2.5 py-1 text-xs font-bold",
              document.status === "reviewed"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {document.status === "reviewed" ? t("badgeReviewed") : t("badgePendingClassification")}
          </span>

          <div className="overflow-hidden rounded-[18px] border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-semibold text-muted-foreground">{t("fieldStudent")}</td>
                  <td className="px-4 py-3 font-bold text-end">{studentName}</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-semibold text-muted-foreground">{t("fieldDocType")}</td>
                  <td className="px-4 py-3 font-bold text-end">
                    {document.documentType ? localize(document.documentType, document.documentTypeEn, locale) : "—"}
                  </td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-3 font-semibold text-muted-foreground">{t("fieldIssuingEntity")}</td>
                  <td className="px-4 py-3 font-bold text-end">
                    {document.issuingEntity ? localize(document.issuingEntity, document.issuingEntityEn, locale) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-semibold text-muted-foreground">{t("fieldUploadDate")}</td>
                  <td className="px-4 py-3 font-bold text-end">
                    <span dir="ltr">{formatRelativeDay(document.createdAt, locale, t("today"), t("yesterday"))}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-[18px] border border-dashed border-border bg-muted/30 p-6 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t("previewCaption")}</p>
            <a
              href={`/api/documents/${document.id}`}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-lg")}
            >
              {t("openDocumentButton")}
            </a>
          </div>
        </div>

        <DocumentClassifyForm
          documentId={document.id}
          studentProfileId={document.studentProfileId}
          alreadyReviewed={document.status === "reviewed"}
          categories={categories}
          supportLevels={supportLevels}
          labels={{
            classifyTitle: t("classifyTitle"),
            categoryLabel: t("categoryLabel"),
            categoryPlaceholder: t("categoryPlaceholder"),
            conditionLabel: t("conditionLabel"),
            conditionPlaceholder: t("conditionPlaceholder"),
            notesLabel: t("notesLabel"),
            notesPlaceholder: t("notesPlaceholder"),
            approveButton: t("approveButton"),
            sendBackButton: t("sendBackButton"),
            errorMissingFields: t("errorMissingFields"),
            errorSaveFailed: t("errorSaveFailed"),
            successApproved: t("successApproved"),
            successReturned: t("successReturned"),
            alreadyReviewed: t("alreadyReviewed"),
          }}
        />
      </div>
    </AppShell>
  );
}
