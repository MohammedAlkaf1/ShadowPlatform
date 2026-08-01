import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";

export interface NavItem {
  href: string;
  label: string;
}

const ROLE_LABELS: Record<string, string> = {
  student: "طالب",
  faculty: "عضو هيئة تدريس",
  specialist: "مختص",
  admin: "مسؤول النظام",
};

export function AppShell({
  children,
  navItems,
  role,
  userEmail,
  tenantName,
}: {
  children: ReactNode;
  navItems: NavItem[];
  role: string;
  userEmail: string;
  tenantName: string;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row" dir="rtl">
      <aside className="flex w-full flex-col justify-between bg-sidebar text-sidebar-foreground md:min-h-screen md:w-64 md:shrink-0">
        <div>
          <div className="border-b border-sidebar-border px-5 py-5">
            <p className="text-lg font-extrabold text-sidebar-foreground">منصة شادو</p>
            <p className="mt-0.5 text-xs text-sidebar-foreground/70">{tenantName}</p>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="border-t border-sidebar-border p-4">
          <p className="truncate text-xs text-sidebar-foreground/70" dir="ltr">
            {userEmail}
          </p>
          <p className="mb-2 text-xs font-semibold text-sidebar-primary">{ROLE_LABELS[role] ?? role}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 bg-background px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
