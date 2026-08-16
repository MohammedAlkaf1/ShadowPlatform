import { cn } from "@/lib/utils";

/**
 * Real logo assets (batch 5 — previously this file rendered plain text,
 * since no icon/wordmark asset existed in the codebase at all; the actual
 * files now live in public/, copied from the design reference's own
 * attachments at docs/assets-1786831157618-dn7a.svg (icon) and
 * docs/assets-1786831159123-84ta.svg (horizontal wordmark) — SVG chosen
 * over the two 1024x1024 PNG exports (docs/assets-1786831148383-x57h.png,
 * docs/assets-1786831150453-wzdp.png, confirmed byte-identical to each
 * other via md5) since SVG stays crisp at the small sizes used here.
 */

/** Icon-only mark — sidebar top, always on the dark sidebar background. */
export function BrandIcon({ alt, className }: { alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static local SVG, no need for next/image's optimization pipeline
  return <img src="/logo-icon.svg" alt={alt} className={cn("block", className)} />;
}

/**
 * Horizontal wordmark — header (every authenticated page) and the login
 * page's left pane. The wordmark's own artwork uses fixed navy text, which
 * needs a light backdrop to stay legible — the design reference wraps it in
 * a small cream rounded plate specifically in dark mode (both those
 * surfaces are otherwise dark), and leaves it unwrapped in light mode
 * (already sitting on a light header/page background). Exact values from
 * the reference: background var(--shadow-cream), 7px/14px padding, 12px
 * corners.
 */
export function BrandWordmark({ alt, className }: { alt: string; className?: string }) {
  return (
    <span className="inline-block rounded-none bg-transparent px-0 py-0 dark:rounded-[12px] dark:bg-[var(--shadow-cream)] dark:px-[14px] dark:py-[7px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG */}
      <img src="/logo-horizontal.svg" alt={alt} className={cn("block", className)} />
    </span>
  );
}
