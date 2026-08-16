import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { FacultyUploadPanel } from "./upload-panel";

/**
 * Dedicated full-page upload flow (batch 3), replacing the per-row
 * ManageResourcesDialog modal. Reachable from the sidebar nav ("رفع ملف
 * لطالب") as a general entry point where faculty pick which student/course
 * to upload for, OR pre-filled via ?link=<FacultyCourseLink id> when
 * reached from a specific row on /faculty/students (see the "manage files"
 * link there). Deliberately faculty-only (not "faculty","admin") — this
 * matches assertFacultyLinkedToStudent/the /api/faculty/resources routes
 * themselves, which give admin no access path to FacultyResource at all.
 */
export default async function FacultyUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyUpload");
  const params = await searchParams;

  const links = await db.facultyCourseLink.findMany({
    where: { facultyUserId: ctx.userId },
    include: { studentProfile: { include: { user: { select: { email: true, fullName: true } } } } },
    orderBy: [{ courseCode: "asc" }],
  });

  const linkOptions = links.map((l) => ({
    id: l.id,
    studentProfileId: l.studentProfileId,
    courseCode: l.courseCode,
    label: `${l.studentProfile.user.fullName} — ${l.courseCode} (${l.studentProfile.user.email})`,
  }));

  const initialLinkId =
    params.link && linkOptions.some((o) => o.id === params.link) ? params.link : (linkOptions[0]?.id ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <FacultyUploadPanel links={linkOptions} initialLinkId={initialLinkId} />

      {/* Hidden note: same real boundary as /faculty/students — see that
          page's comment. Repeated here since this is now a standalone
          screen a faculty member can land on directly from the nav. */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
  );
}
