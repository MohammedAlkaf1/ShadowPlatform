import { cn } from "@/lib/utils";

/**
 * Real logo assets pulled directly from the design source
 * (assets/shadow_icon.svg, assets/shadow_mark.svg,
 * assets/shadow_mark_cream.svg) — see docs/Shadow Platform.dc.html's header
 * template. The icon (logo-icon.svg) has its own navy plate baked in and is
 * used ONLY on the sidebar's always-dark background. The header's mark
 * (logo-mark.svg / logo-mark-cream.svg) has no plate — it's the bare arch
 * glyph, theme-swapped, sitting directly on the header's own background.
 */

/** Icon-only mark with its navy plate — sidebar top, always on the dark sidebar background. */
export function BrandIcon({ alt, className }: { alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local SVG, no need for next/image's optimization pipeline
  return <img src="/logo-icon.svg" alt={alt} className={cn("block", className)} />;
}

/**
 * Header lockup — the design reference builds this live from a theme-
 * swapped icon mark (no plate) plus real text, NOT a single flattened
 * wordmark image: {{ t.markLight }}/{{ t.markDark }} display-toggle two
 * <img>s, then a stacked "شادو" (800/21px) + "SHADOW" (600/9px, letter-
 * spaced, terracotta) column next to it. `markClassName` sizes just the
 * icon (the reference's `height:36px`); the text sizes are fixed to match
 * the reference exactly regardless of container size.
 */
export function BrandWordmark({ alt, markClassName }: { alt: string; markClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-[11px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG */}
      <img src="/logo-mark.svg" alt={alt} className={cn("block dark:hidden", markClassName)} />
      {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG */}
      <img src="/logo-mark-cream.svg" alt="" className={cn("hidden dark:block", markClassName)} />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[21px] font-extrabold text-foreground">شادو</span>
        <span className="mt-1 text-[9px] font-semibold tracking-[4.5px] text-accent">SHADOW</span>
      </span>
    </span>
  );
}
