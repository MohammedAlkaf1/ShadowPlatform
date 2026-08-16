import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export interface NavItem {
  href: string;
  label: string;
}

export async function AppShell({
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
  const tBrand = await getTranslations("Brand");
  const tRoles = await getTranslations("Common.roles");

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="flex w-full flex-col justify-between bg-sidebar text-sidebar-foreground md:min-h-screen md:w-64 md:shrink-0">
        <div>
          <div className="border-b border-sidebar-border px-5 py-5">
            <BrandMark className="text-lg font-extrabold text-sidebar-foreground">{tBrand("name")}</BrandMark>
            <p className="mt-0.5 text-xs break-words text-sidebar-foreground/70">{tenantName}</p>
          </div>
          <NavLinks navItems={navItems} />
        </div>
        <div className="border-t border-sidebar-border p-4">
          <LanguageSwitcher className="mb-3 w-full justify-center" />
          <p className="text-xs break-words text-sidebar-foreground/70" dir="ltr">
            {userEmail}
          </p>
          <p className="mb-2 text-xs font-semibold text-sidebar-primary">
            {tRoles.has(role) ? tRoles(role) : role}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        {/* Theme toggle lives here so it's visible on every authenticated
            page (this header renders once per navigation, wrapping every
            role's pages) — no accent/terracotta color anywhere in this
            chrome, per the one-primary-action-per-screen rule. */}
        <header className="flex items-center justify-end border-b border-border bg-background px-4 py-3 sm:px-8">
          <ThemeToggle />
        </header>
        <main className="flex-1 bg-background px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
