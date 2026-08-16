import { cn } from "@/lib/utils";

/**
 * The design reference's "simple 12-bar sparkline-style chart at the
 * bottom of the hero card" — used ONLY for roles with a genuine weekly
 * time-series worth showing (registrations/week for admin, assessments
 * completed/week for a specialist), not forced onto every hero card.
 *
 * Deliberately plain divs (bar heights as CSS percentages), not a
 * recharts component — this is a small decorative trend indicator inside
 * a stat card, not an interactive/tooltipped chart like category-chart.tsx.
 *
 * `dir="ltr"` on the row so the bars always read chronologically left-to-
 * right (oldest to newest) regardless of page language, matching the
 * date-column convention established elsewhere (a technical/chronological
 * axis, not natural-language content, so it stays physically fixed rather
 * than mirroring in RTL).
 */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    // h-11 (44px) + gap-[5px] + rounded-[4px]: the reference file's exact
    // chart-row height/gap/bar-corner values. Bar width stays flexible
    // (flex-1, min 3px) rather than the reference's fixed 12px — a real
    // hero card's width varies by viewport/locale, unlike the mock's fixed
    // 1440px canvas, so a hardcoded bar width would either overflow or
    // leave dead space instead of filling the row.
    <div dir="ltr" className={cn("flex h-11 items-end gap-[5px]", className)} role="img">
      {values.map((v, i) => (
        <div
          key={i}
          className="min-w-[3px] flex-1 rounded-[4px] bg-current opacity-70"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
