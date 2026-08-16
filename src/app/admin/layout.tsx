import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("admin");
  const t = await getTranslations("Nav.admin");
  // Batch 3: matches the mockup's exact 3-item admin nav (dashboard, audit
  // log, assign specialist). "Reports" is no longer a separate nav entry —
  // its one real capability (CSV export) is now surfaced as the terracotta
  // button on the audit-log screen, reusing the same /api/admin/export/
  // students route. The page itself still exists at /admin/reports (not
  // deleted, still guarded by requireRole("admin")), just no longer linked
  // from the nav — see the batch report.
  const navItems: NavItem[] = [
    { href: "/admin/stats", label: t("stats") },
    { href: "/admin/audit-log", label: t("auditLog") },
    { href: "/admin/users", label: t("assign") },
  ];
  return (
    <AppShell navItems={navItems} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
