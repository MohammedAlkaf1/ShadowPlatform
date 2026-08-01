import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

const NAV_ITEMS: NavItem[] = [
  { href: "/student/status", label: "حالة الطلب" },
  { href: "/student/documents", label: "المستندات" },
];

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("student");
  return (
    <AppShell navItems={NAV_ITEMS} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
