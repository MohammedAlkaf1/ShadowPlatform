"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./app-shell";
import { NavIcon } from "./nav-icon";

/**
 * Split out from AppShell (a Server Component) specifically because active-
 * item detection needs the current pathname, which only `usePathname()`
 * (client-only) can give us — there's no clean server-side "current route"
 * signal available to a layout in the App Router.
 *
 * Active state is a subtle background highlight + a small dot — explicitly
 * NOT terracotta/accent-colored (the design reference reserves that for
 * the one primary action per screen, and nav chrome isn't an action). Both
 * the highlight and the dot use existing sidebar tokens, not --accent.
 *
 * Rows are min-h-11 (44px) to meet the design reference's touch-target
 * minimum for interactive rows.
 */
export function NavLinks({ navItems }: { navItems: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const isActive = pathname === item.href || (!item.exact && pathname?.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-5 w-[3px] shrink-0 rounded-full transition-colors",
                isActive ? "bg-accent" : "bg-transparent"
              )}
            />
            <NavIcon name={item.icon} className={cn("shrink-0", !isActive && "opacity-70")} />
            <span className="break-words">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
