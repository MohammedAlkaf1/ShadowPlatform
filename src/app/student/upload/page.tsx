import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { UploadForm } from "./upload-form";
import { ReplaceButton } from "./replace-button";
import { AppShell } from "@/components/layout/app-shell";
import { getStudentNavItems } from "@/components/layout/nav-items";
import { MAX_UPLOAD_SIZE_BYTES } from "./constants";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { localize } from "@/lib/localize";
import type { DocumentStatus, Document } from "@prisma/client";

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Full "2 أغسطس 2025" style date (Western digits even in Arabic) — this
// table's own column, distinct from the app-wide `formatDate` helper used
// everywhere else, which intentionally stays locale-numeric/short.
function formatFullDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

// Documents needing the student's attention sort to the end of the list,
// most-recent-first within each group — real per-document data, just
// grouped so an item requiring action isn't buried above completed ones.
function sortDocuments(documents: Document[]): Document[] {
  return [...documents].sort((a, b) => {
    const aNeeds = a.status === "needs_update" ? 1 : 0;
    const bNeeds = b.status === "needs_update" ? 1 : 0;
    if (aNeeds !== bNeeds) return aNeeds - bNeeds;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

const STATUS_TONE: Record<DocumentStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  reviewed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  needs_update: "bg-accent/10 text-accent",
};

/**
 * "مستنداتي" — dropzone upload (reuses uploadDocument verbatim, see
 * actions.ts) plus the student's own upload history. Status badges read
 * straight from the real per-document DocumentStatus column (pending/
 * reviewed/needs_update) — a specialist can flag one specific document as
 * needing a resubmission without touching the others or the whole
 * request's RequestStatus. Sizing/spacing pulled directly from the
 * approved Figma file (rSY5pDmqY1jctcNOBg7gPC, node 67:92 "MyDocs").
 */
export default async function StudentUploadPage() {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("StudentUpload");
  const locale = await getLocale();
  const navItems = await getStudentNavItems();

  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  const documents = studentProfile
    ? sortDocuments(
        await db.document.findMany({
          where: { studentProfileId: studentProfile.id, deletedAt: null },
        })
      )
    : [];

  const STATUS_LABEL: Record<DocumentStatus, string> = {
    pending: t("statusPending"),
    reviewed: t("statusDone"),
    needs_update: t("statusNeedsUpdate"),
  };

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
      <div className="w-full">
        <UploadForm maxSizeLabel={String(Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)))} />

        <div className="mt-5 h-[286.4px] w-full overflow-hidden rounded-[18px] border-[0.8px] border-border bg-card shadow-[0px_1px_2px_rgba(30,42,58,0.05),0px_12px_28px_-18px_rgba(30,42,58,0.28)]">
          {documents.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-[0.8px] border-border bg-[#f0ebe1] dark:bg-muted">
                    <th className="px-5 pt-3 pb-[12.8px] text-start text-[11px] font-bold tracking-[0.6px] text-muted-foreground">
                      {t("tableName")}
                    </th>
                    <th className="px-5 pt-3 pb-[12.8px] text-start text-[11px] font-bold tracking-[0.6px] text-muted-foreground">
                      {t("tableDate")}
                    </th>
                    <th className="px-5 pt-3 pb-[12.8px] text-start text-[11px] font-bold tracking-[0.6px] text-muted-foreground">
                      {t("tableSize")}
                    </th>
                    <th className="px-5 pt-3 pb-[12.8px] text-start text-[11px] font-bold tracking-[0.6px] text-muted-foreground">
                      {t("tableStatus")}
                    </th>
                    <th className="px-5 pt-3 pb-[12.8px]" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id} className="border-b-[0.8px] border-[#e4dfd4] dark:border-border">
                      <td className="px-5 pt-[14px] pb-[14.8px]">
                        <span className="flex items-center gap-[11px] text-sm font-bold text-foreground">
                          <span className="flex size-8 items-center justify-center rounded-[9px] border-[0.8px] border-border bg-muted">
                            <FileText className="size-4 text-muted-foreground" />
                          </span>
                          {localize(doc.originalFilename, doc.originalFilenameEn, locale)}
                        </span>
                      </td>
                      <td className="px-5 pt-[14px] pb-[14.8px] text-[13px] text-muted-foreground">
                        {formatFullDate(doc.createdAt, locale)}
                      </td>
                      <td className="px-5 pt-[14px] pb-[14.8px] text-[13px] text-muted-foreground" dir="ltr">
                        {formatSize(doc.sizeBytes)}
                      </td>
                      <td className="px-5 pt-[14px] pb-[14.8px]">
                        <span className={cn("inline-flex rounded-lg px-[11px] py-[5px] text-xs font-bold", STATUS_TONE[doc.status])}>
                          {STATUS_LABEL[doc.status]}
                        </span>
                      </td>
                      <td className="px-5 pt-[14px] pb-[14.8px]">
                        {doc.status === "needs_update" ? (
                          <ReplaceButton label={t("replaceAction")} />
                        ) : (
                          <a href={`/student/documents/${doc.id}`} className="text-[13px] font-bold text-muted-foreground hover:text-foreground">
                            {t("viewAction")}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
