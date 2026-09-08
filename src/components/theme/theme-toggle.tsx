"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pill-shaped toggle with a small colored dot + text label, matching the
 * design reference's `themeDot` pattern. A single button (not two side-by-
 * side options like LanguageSwitcher) since light/dark is a simple binary
 * toggle, not a multi-way choice.
 *
 * next-themes' own `resolvedTheme` is `undefined` on the server and on the
 * client's very first render (it can't know the persisted choice — that
 * lives in localStorage — until after mount), which is used directly as
 * the "not ready yet" signal instead of tracking a separate `mounted`
 * state + effect (an explicit `setState` inside a bare mount-effect trips
 * the react-hooks/set-state-in-effect rule). Rendering the light-mode
 * label/dot until `resolvedTheme` resolves avoids a hydration mismatch
 * and matches the ThemeProvider's own `defaultTheme="light"`.
 */
export function ThemeToggle({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("ThemeToggle");

  const isDark = resolvedTheme === "dark";

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={t("label")}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted",
          className
        )}
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("label")}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full transition-colors", isDark ? "bg-accent" : "bg-primary")}
      />
      {isDark ? t("dark") : t("light")}
    </button>
  );
}
