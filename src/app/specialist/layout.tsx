import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

const NAV_ITEMS: NavItem[] = [
  { href: "/specialist/queue", label: "قائمة المراجعة" },
  { href: "/specialist/alerts", label: "التنبيهات" },
];

export default async function SpecialistLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("specialist");
  return (
    <AppShell navItems={NAV_ITEMS} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
