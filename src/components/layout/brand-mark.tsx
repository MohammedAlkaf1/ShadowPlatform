import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The platform's wordmark (there's no separate icon-mark asset in this
 * codebase — text is the only "logo" that exists — so the design
 * reference's icon-mark-in-sidebar / horizontal-logo-in-header rule is
 * applied to this same text element in both placements).
 *
 * Dark-mode-only backing plate, per the design reference exactly:
 * background #ECE7DC (== --shadow-cream, reused via var() rather than
 * redefined), 7px/14px padding, 12px corners — transparent/no padding in
 * light mode. Pure CSS (`dark:` variant reacting to the `.dark` class on
 * <html>), no theme JS needed here. Text switches to navy in dark mode
 * too, since sidebar-foreground (light cream) would be unreadable on a
 * cream plate.
 */
export function BrandMark({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-none bg-transparent px-0 py-0 dark:rounded-[12px] dark:bg-[var(--shadow-cream)] dark:px-[14px] dark:py-[7px] dark:text-[var(--shadow-navy)]",
        className
      )}
    >
      {children}
    </span>
  );
}
