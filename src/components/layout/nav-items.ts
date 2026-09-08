import { getTranslations } from "next-intl/server";
import type { NavItem } from "./app-shell";

/**
 * Per-SECTION nav items (not per-viewer-role): an admin browsing a
 * specialist page (every role's pages allow an admin bypass — see each
 * page's requireRole(role, "admin") call) should still see the
 * specialist's nav while they're in that section, not their own admin
 * nav. So each page passes its own fixed section literal here explicitly,
 * rather than AppShell inferring it from the viewer's actual role.
 *
 * Icons match the design reference's own navIcons map (dash: grid, audit:
 * list, assign: userPlus, upload: upload, exams: exam, terms: book, doc:
 * file, users: users) — see nav-icon.tsx for the exact stroke paths.
 */
export async function getAdminNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.admin");
  return [
    { href: "/admin", label: t("dashboard"), icon: "grid", exact: true },
    { href: "/admin/reports", label: t("reports"), icon: "chart" },
    { href: "/admin/audit-log", label: t("auditLog"), icon: "list" },
    { href: "/admin/users", label: t("assign"), icon: "userPlus" },
    { href: "/admin/user-management", label: t("users"), icon: "users" },
  ];
}

export async function getFacultyNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.faculty");
  return [
    { href: "/faculty/students", label: t("students"), icon: "grid" },
    { href: "/faculty/upload", label: t("upload"), icon: "upload" },
    { href: "/faculty/exams", label: t("exams"), icon: "exam" },
    { href: "/faculty/keyterms", label: t("keyterms"), icon: "book" },
  ];
}

/**
 * The 2nd item now matches the reference file's literal nav array
 * ("مراجعة وثيقة"/"Review document"): it links to `/specialist/documents`,
 * a real list of this specialist's pending documents, so it has a concrete
 * destination without needing a student id up front (unlike a bare
 * `/specialist/students/[id]/review` link, which does).
 */
export async function getSpecialistNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.specialist");
  return [
    { href: "/specialist/queue", label: t("queue"), icon: "grid" },
    { href: "/specialist/documents", label: t("documents"), icon: "file" },
  ];
}

export async function getStudentNavItems(): Promise<NavItem[]> {
  const t = await getTranslations("Nav.student");
  return [
    { href: "/student/status", label: t("status"), icon: "grid" },
    { href: "/student/upload", label: t("upload"), icon: "upload" },
  ];
}
