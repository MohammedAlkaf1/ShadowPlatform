import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { UserRole } from "@prisma/client";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandIcon, BrandWordmark } from "./brand-mark";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export interface NavItem {
  href: string;
  label: string;
}

// roleLabel shown in the sidebar's user card is the VIEWER's actual role
// (ctx.role); navItems is which SECTION's nav to show, passed in explicitly
// by each page (see nav-items.ts) — these can differ when an admin browses
// another role's pages (every role's pages allow an admin bypass), in
// which case the section's nav should still show, not the admin's own.

/**
 * Batch 5 rewrite. Two structural bugs the design reference's real
 * screenshots caught (previous version had these backwards):
 *
 * 1. LanguageSwitcher/SignOutButton belong in the HEADER (top bar above
 *    main content), not the sidebar. The sidebar's bottom section is ONLY
 *    the user-info card (name/role/email) — nothing interactive there.
 * 2. The header needs the CURRENT PAGE's title/subtitle (large bold title
 *    + smaller muted subtitle) plus the horizontal wordmark logo — neither
 *    of which a layout-level shell can know on its own, since a Next.js
 *    layout has no visibility into which page.tsx it's currently wrapping.
 *    Resolved by making `title`/`subtitle` explicit props: each page.tsx
 *    now calls <AppShell> directly (not layout.tsx), passing its own
 *    title/subtitle — the only way to get page-specific content into
 *    shared chrome without a client-side context (which would either
 *    force a client boundary on every page or flash empty on first paint,
 *    since the value could only be set post-hydration via an effect).
 *    See the batch-5 report for the full reasoning.
 *
 * Nav items are built per-SECTION by the small helpers in nav-items.ts and
 * passed in explicitly (see the note above) — centralizes each section's
 * nav definition in one place per role, callable from any page now that
 * every page constructs its own AppShell call instead of a shared
 * layout.tsx doing it once.
 */
export async function AppShell({
  children,
  navItems,
  role,
  userEmail,
  tenantName,
  title,
  subtitle,
}: {
  children: ReactNode;
  navItems: NavItem[];
  role: UserRole;
  userEmail: string;
  tenantName: string;
  title: string;
  subtitle: string;
}) {
  const tBrand = await getTranslations("Brand");
  const tRoles = await getTranslations("Common.roles");

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      {/* Sidebar: icon mark + tagline (top), nav (middle), user card ONLY
          (bottom) — no language/sign-out controls here, those live in the
          header now. md:w-[272px] matches the reference file's exact
          sidebar width.
          Batch 6: md:sticky + md:top-0 + md:h-screen pins the sidebar to
          the viewport on desktop instead of scrolling away with a long
          page's main content — md:overflow-y-auto makes the sidebar's OWN
          content scroll independently if it's ever taller than the
          viewport, so the bottom user card stays reachable (scrolled to)
          rather than pushed off-screen. Mobile (<md) keeps its normal
          in-flow stacked layout, unaffected. */}
      <aside className="flex w-full flex-col justify-between bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-[272px] md:shrink-0 md:overflow-y-auto">
        <div>
          <div className="flex items-center gap-[11px] border-b border-sidebar-border px-[18px] py-[22px]">
            <BrandIcon alt={tBrand("name")} className="size-[42px] rounded-[13px] shadow-lg" />
            <p className="text-xs break-words text-sidebar-foreground/70">{tenantName}</p>
          </div>
          <NavLinks navItems={navItems} />
        </div>
        <div className="m-4 rounded-[16px] bg-sidebar-accent/40 p-[15px]">
          <p className="text-sm font-bold break-words text-sidebar-foreground">
            {tRoles.has(role) ? tRoles(role) : role}
          </p>
          {/* Batch 8: dir="ltr" on an inline span, not the block <p> — see
              admin/audit-log/page.tsx's comment for why dir="ltr"
              directly on a block-level element breaks RTL alignment
              against its sibling (the role line above). */}
          <p className="mt-0.5 text-[11.5px] break-words text-sidebar-foreground/70">
            <span dir="ltr">{userEmail}</span>
          </p>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Header: logo-plate + divider, then this page's title/subtitle
            (flex-1, fills the middle), then the 3 chrome buttons — exact
            DOM order from the reference file's own header template. No
            accent/terracotta color anywhere here, per the one-primary-
            action-per-screen rule. */}
        <header className="flex min-h-[76px] shrink-0 flex-wrap items-center justify-between gap-x-[22px] gap-y-2 border-b border-border bg-background px-4 py-3 sm:px-7">
          <div className="flex shrink-0 items-center gap-[22px]">
            <BrandWordmark alt={tBrand("name")} className="h-8 sm:h-9" />
            <div className="hidden h-[34px] w-px bg-border sm:block" />
          </div>
          {/* break-words, not truncate — titles/subtitles must never clip;
              min-h-[76px] (not a fixed height) on the header lets it grow
              instead of cutting text off on a long title or narrow
              viewport. */}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold break-words text-foreground sm:text-xl">{title}</h1>
            <p className="text-xs break-words text-muted-foreground sm:text-[12.5px]">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 bg-background px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
