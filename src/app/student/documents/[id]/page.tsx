import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { DocumentStatus } from "@prisma/client";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { localize } from "@/lib/localize";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getStudentNavItems } from "@/components/layout/nav-items";
import { Eye, FileText } from "lucide-react";

// Same tone convention as the specialist document list (documents-tab.tsx).
const STATUS_TONE: Record<DocumentStatus, string> = {
  reviewed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  pending: "bg-muted text-muted-foreground",
  needs_update: "bg-accent/15 text-accent",
};

/**
 * Read-only document preview for the student who owns the file — no
 * classification form (students never see category/condition/support
 * level, per this app's core visibility rule), a "عرض فقط" pill making that
 * read-only nature explicit, and a status pill that reflects the document's
 * actual review state (matches the Cloud Design reference).
 */
export default async function StudentDocumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params;
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentDocumentView");
  const locale = await getLocale();

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
    include: { user: { select: { fullName: true, fullNameEn: true } } },
  });
  if (!studentProfile) notFound();

  const document = await db.document.findUnique({ where: { id: documentId } });
  if (!document || document.deletedAt || document.studentProfileId !== studentProfile.id) notFound();

  const studentName = localize(studentProfile.user.fullName, studentProfile.user.fullNameEn, locale);
  const navItems = await getStudentNavItems();

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
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex justify-end">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
            <Eye className="size-3.5" />
            {t("viewOnly")}
          </span>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-border bg-card p-4">
          <span
            className={cn(
              "inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
              STATUS_TONE[document.status]
            )}
          >
            {document.status === "reviewed"
              ? t("badgeReviewed")
              : document.status === "needs_update"
                ? t("badgeNeedsUpdate")
                : t("badgePendingClassification")}
          </span>

          <div className="my-3.5 border-t border-border" />

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex min-h-52 flex-1 flex-col items-center justify-center gap-3 rounded-[14px] bg-muted/40 p-6 text-center sm:max-w-[45%]">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("previewCaption")}</p>
              <a
                href={`/api/documents/${document.id}`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
                )}
              >
                {t("openDocumentButton")}
              </a>
            </div>

            <div className="flex flex-1 flex-col gap-3 text-sm">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-semibold text-muted-foreground">{t("fieldStudent")}</span>
                <span className="font-bold">{studentName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-semibold text-muted-foreground">{t("fieldDocType")}</span>
                <span className="font-bold">
                  {document.documentType ? localize(document.documentType, document.documentTypeEn, locale) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <span className="font-semibold text-muted-foreground">{t("fieldIssuingEntity")}</span>
                <span className="font-bold">
                  {document.issuingEntity ? localize(document.issuingEntity, document.issuingEntityEn, locale) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground">{t("fieldUploadDate")}</span>
                <span className="font-bold" dir="ltr">
                  {formatDate(document.createdAt, locale)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
