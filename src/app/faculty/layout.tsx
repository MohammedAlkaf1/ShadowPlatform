import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { requireRolePage } from "@/lib/require-role-page";

export default async function FacultyLayout({ children }: { children: ReactNode }) {
  const ctx = await requireRolePage("faculty");
  const t = await getTranslations("Nav.faculty");
  const navItems: NavItem[] = [
    { href: "/faculty/students", label: t("students") },
    { href: "/faculty/upload", label: t("upload") },
  ];
  return (
    <AppShell navItems={navItems} role={ctx.role} userEmail={ctx.userEmail} tenantName={ctx.tenantName}>
      {children}
    </AppShell>
  );
}
