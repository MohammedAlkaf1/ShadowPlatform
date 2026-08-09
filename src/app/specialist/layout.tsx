import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

export default async function SpecialistLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("specialist");
  const t = await getTranslations("Nav.specialist");
  const navItems: NavItem[] = [
    { href: "/specialist/queue", label: t("queue") },
    { href: "/specialist/alerts", label: t("alerts") },
  ];
  return (
    <AppShell navItems={navItems} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
