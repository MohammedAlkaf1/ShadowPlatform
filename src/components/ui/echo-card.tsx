import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The design reference's one recurring branded signature: a second,
 * solid-translucent-fill layer sitting behind the single most important
 * card on a screen (the hero stat card on each dashboard), offset and
 * peeking out asymmetrically — distinct from the card's own ordinary
 * box-shadow/ring elevation, which is unaffected and stays as-is.
 *
 * Exact proportions from the design reference, relative to the wrapped
 * card's own box: inset 18px from the top/start, peeking out 9px past the
 * end edge and 11px past the bottom edge, 24px corners, translucent navy
 * in light mode / translucent cream in dark mode.
 *
 * Uses CSS logical properties (`insetInlineStart`/`insetInlineEnd`, not
 * `left`/`right`) so the "peeks out" side mirrors correctly in RTL —
 * the design reference's own layouts mirror horizontally between the two
 * languages, and this echo layer should too rather than always sitting
 * physically bottom-right regardless of reading direction.
 *
 * Use ONCE per screen, only on the highest-priority card (e.g. wrap just
 * the hero stat <Card> in a dashboard with <EchoCard>). Every other card
 * on the same screen should NOT get this treatment.
 */
export function EchoCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-[24px] bg-[rgba(30,42,58,0.14)] dark:bg-[rgba(241,236,225,0.07)]"
        style={{
          top: "18px",
          insetInlineEnd: "-9px",
          bottom: "-11px",
          insetInlineStart: "18px",
        }}
      />
      {/* Batch 8 (issues 3/4): h-full added here — without it, this
          wrapper sizes to its own content (shrink-to-fit) even when the
          OUTER div above is stretched to match a taller sibling (e.g. the
          3-stacked side-stat column) via the row's items-stretch. The
          front <Card> inside (itself h-full against THIS div) would then
          resolve against a non-definite/auto height and just size to its
          own content too — leaving the front card much shorter than the
          echo layer behind it (which DOES stretch, since it's absolutely
          positioned with top+bottom insets against the outer stretched
          div). The result: instead of peeking out 9-11px as intended, the
          echo layer's translucent fill was exposed for the ENTIRE height
          difference — a large stray rectangle of color below the card's
          real content, which is what was actually behind the "cards look
          messy/disorganized" report on pages whose hero card has no
          sparkline to fill that space (faculty/students, student/status)
          or whose sparkline is short (admin/stats, specialist/queue). */}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
