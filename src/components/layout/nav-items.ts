import { getTranslations } from "next-intl/server";
import type { NavItem } from "./app-shell";

/**
 * Per-SECTION nav items (not per-viewer-role): an admin browsing a
 * specialist page (every role's pages allow an admin bypass — see each
 * page's requireRole(role, "admin") call) should still see the
 * specialist's nav while they're in that section, not their own admin
 * nav. So each page passes its own fixed section literal here explicitly,
 * rather than AppShell inferring it from the viewer's actual role.
 */
export async function getAdminNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.admin");
  return [
    { href: "/admin/stats", label: t("stats") },
    { href: "/admin/audit-log", label: t("auditLog") },
    { href: "/admin/users", label: t("assign") },
  ];
}

export async function getFacultyNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.faculty");
  return [
    { href: "/faculty/students", label: t("students") },
    { href: "/faculty/upload", label: t("upload") },
  ];
}

/**
 * Deliberate deviation from the reference file's literal nav array (which
 * labels its 2nd item "مراجعة وثيقة"/"Review document"): a review screen
 * needs a concrete student id and has no sensible destination without one,
 * so this keeps the real, working MentorAlert/`/specialist/alerts` feature
 * as the 2nd nav item instead — same reasoning batch 3 used when it
 * decided not to add a contextless review link to the nav in the first
 * place.
 */
export async function getSpecialistNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.specialist");
  return [
    { href: "/specialist/queue", label: t("queue") },
    { href: "/specialist/alerts", label: t("alerts") },
  ];
}

export async function getStudentNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.student");
  return [
    { href: "/student/status", label: t("status") },
    { href: "/student/upload", label: t("upload") },
  ];
}
