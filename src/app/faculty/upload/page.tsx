import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { localize } from "@/lib/localize";
import { FacultyUploadPanel } from "./upload-panel";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";

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
  const locale = await getLocale();
  const params = await searchParams;

  const links = await db.facultyCourseLink.findMany({
    where: { facultyUserId: ctx.userId },
    include: { studentProfile: { include: { user: { select: { email: true, fullName: true, fullNameEn: true } } } } },
    orderBy: [{ courseCode: "asc" }],
  });

  // The picker dropdown is gone — target selection now happens on
  // /faculty/students (each roster row's "الملفات" button deep-links here
  // with ?link=<id>). Landing here without one (e.g. straight from the nav)
  // just targets the first course link, same as the old dropdown's default.
  const selectedLink =
    (params.link ? links.find((l) => l.id === params.link) : null) ?? links[0] ?? null;

  const navItems = await getFacultyNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
    <div className="space-y-6">
      {selectedLink ? (
        <FacultyUploadPanel
          link={{
            id: selectedLink.id,
            studentProfileId: selectedLink.studentProfileId,
            courseCode: selectedLink.courseCode,
            studentName: localize(selectedLink.studentProfile.user.fullName, selectedLink.studentProfile.user.fullNameEn, locale),
          }}
        />
      ) : (
        <p className="rounded-2xl border border-border bg-card py-8 text-center text-sm text-muted-foreground">
          {t("noCourseLinks")}
        </p>
      )}
    </div>
    </AppShell>
  );
}
