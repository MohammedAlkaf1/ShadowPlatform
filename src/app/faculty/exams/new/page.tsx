import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { AppShell } from "@/components/layout/app-shell";
import { getFacultyNavItems } from "@/components/layout/nav-items";
import { NewExamPanel } from "./new-exam-panel";

/**
 * /faculty/exams/new — the two explicit, clearly-separated creation paths
 * (manual / AI-generated) required by the feature spec. Deliberately
 * faculty-only, same as /faculty/exams itself.
 */
export default async function NewExamPage() {
  const ctx = await requireRole("faculty");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyExams");

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
      title={t("newTitle")}
      subtitle={t("newSubtitle")}
    >
      <NewExamPanel courseCodes={courseCodes} />
    </AppShell>
  );
}
