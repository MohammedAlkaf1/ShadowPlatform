"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wires next-themes to the `.dark { ... }` CSS custom-property block and
 * the `@custom-variant dark (&:is(.dark *))` line already in globals.css —
 * both were already correct and complete, just never connected to
 * anything. `attribute="class"` toggles the `dark` class on <html>, which
 * is exactly what that custom-variant selector matches against.
 *
 * Persistence is next-themes' own localStorage key (not a User.locale-style
 * DB field) — the design spec only requires the choice to be "remembered,"
 * which localStorage satisfies without needing a server round trip on
 * every toggle. Defaults to light (not "system") so a first-time visitor
 * sees the brand's designed default rather than following OS preference,
 * matching how locale defaults to Arabic rather than following
 * Accept-Language as the top-priority signal.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
