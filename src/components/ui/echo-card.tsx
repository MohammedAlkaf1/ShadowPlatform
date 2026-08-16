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
      <div className="relative z-10">{children}</div>
    </div>
  );
}
