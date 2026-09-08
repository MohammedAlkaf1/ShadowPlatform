import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { localize } from "@/lib/localize";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { getStudentNavItems } from "@/components/layout/nav-items";
import { Eye, FileText } from "lucide-react";

/**
 * Read-only document preview for the student who owns the file — mirrors
 * the specialist's two-field-grid + preview-box layout, but with no
 * classification form (students never see category/condition/support
 * level, per this app's core visibility rule) and a "عرض فقط" banner
 * making that read-only nature explicit.
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
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-2.5">
          <Eye className="size-4 text-muted-foreground" />
          <span className="text-xs font-bold text-muted-foreground">{t("viewOnly")}</span>
        </div>

        <span className="inline-flex w-fit rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {t("badgePendingClassification")}
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
                  <span dir="ltr">{formatDate(document.createdAt, locale)}</span>
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
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            )}
          >
            {t("openDocumentButton")}
          </a>
        </div>
      </div>
    </AppShell>
  );
}
