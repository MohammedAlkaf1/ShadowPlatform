import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

const NAV_ITEMS: NavItem[] = [{ href: "/admin/users", label: "إدارة المستخدمين" }];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("admin");
  return (
    <AppShell navItems={NAV_ITEMS} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
