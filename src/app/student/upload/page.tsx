import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { UploadForm } from "./upload-form";

/**
 * Dedicated full-page upload flow (batch 3), replacing the inline form that
 * used to sit at the top of /student/documents. Reachable from the sidebar
 * nav ("رفع وثيقة"). Reuses uploadDocument verbatim (see actions.ts) — same
 * validation, same encryption, same audit action.
 *
 * The mockup's upload-page reference shows extra descriptive fields
 * ("Document type", "Issued by", "Issue date") in the form panel. Those
 * aren't real columns on the Document model (see prisma/schema.prisma) and
 * this batch makes no schema changes, so this page only presents what is
 * actually collected today: the file itself. Flagged in the batch report.
 */
export default async function StudentUploadPage() {
  await requireRole("student");
  const t = await getTranslations("StudentUpload");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <UploadForm />

      {/* Hidden note: real boundary — the document goes to the assigned
          specialist only; neither the student nor their faculty ever see
          the classification/support level that results from the review
          (see /student/status's own hidden note for the fuller reasoning). */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
  );
}
