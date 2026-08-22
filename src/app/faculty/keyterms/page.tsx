import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { KeytermsPanel } from "./keyterms-panel";

/**
 * /faculty/keyterms — per-course lecture keyterm glossary management:
 * upload slides, review the AI-extracted draft, approve/edit, and see the
 * accumulated glossary so far. Faculty-only, same pattern as
 * /faculty/exams/new (course list fetched server-side from this faculty
 * member's own FacultyCourseLink rows, passed to a client panel).
 */
export default async function FacultyKeytermsPage() {
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyKeyterms");

  const links = await db.facultyCourseLink.findMany({
    where: { facultyUserId: ctx.userId },
    select: { courseCode: true },
    distinct: ["courseCode"],
    orderBy: { courseCode: "asc" },
  });
  const courseCodes = links.map((l) => l.courseCode);

  const navItems = await getFacultyNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <KeytermsPanel courseCodes={courseCodes} />
    </AppShell>
  );
}
