import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("student");
  const t = await getTranslations("Nav.student");
  const navItems: NavItem[] = [
    { href: "/student/status", label: t("status") },
    { href: "/student/documents", label: t("documents") },
  ];
  return (
    <AppShell navItems={navItems} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
