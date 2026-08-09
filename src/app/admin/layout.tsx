import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("admin");
  const t = await getTranslations("Nav.admin");
  const navItems: NavItem[] = [
    { href: "/admin/stats", label: t("stats") },
    { href: "/admin/users", label: t("users") },
    { href: "/admin/reports", label: t("reports") },
    { href: "/admin/audit-log", label: t("auditLog") },
  ];
  return (
    <AppShell navItems={navItems} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
