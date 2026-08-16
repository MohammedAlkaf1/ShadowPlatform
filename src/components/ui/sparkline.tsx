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
    <div dir="ltr" className={cn("flex h-10 items-end gap-1", className)} role="img">
      {values.map((v, i) => (
        <div
          key={i}
          className="min-w-[3px] flex-1 rounded-sm bg-current opacity-70"
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
