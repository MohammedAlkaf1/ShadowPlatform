/**
 * Exact stroke-path icon set copied from the design reference's own ICONS
 * object (docs/Shadow Platform.dc.html) — used instead of swapping in a
 * similar-but-different lucide icon, so the sidebar nav glyphs match the
 * reference pixel-for-pixel (24x24 viewBox, stroke-width 1.75, round caps).
 */
const NAV_ICON_PATHS = {
  grid: "M4.6 4.6h5.6v5.6H4.6zM13.8 4.6h5.6v5.6h-5.6zM4.6 13.8h5.6v5.6H4.6zM13.8 13.8h5.6v5.6h-5.6z",
  list: "M9 6.6h10.4M9 12h10.4M9 17.4h10.4M4.9 6.6h.01M4.9 12h.01M4.9 17.4h.01",
  userPlus:
    "M13.6 20v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.4a3.8 3.8 0 0 0-3.8 3.8V20M8.6 11.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2M17.6 8.6v5M15.1 11.1h5",
  upload: "M12 15.4V4.6M8.3 8.3 12 4.6l3.7 3.7M4.6 15v3.4a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V15",
  file: "M13.4 3.6H7.6a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2V8.6zM13.4 3.6v5h5M9 13h6M9 16.4h4",
  exam: "M9.4 5.6H7.6a1.8 1.8 0 0 0-1.8 1.8v11a1.8 1.8 0 0 0 1.8 1.8h8.8a1.8 1.8 0 0 0 1.8-1.8v-11a1.8 1.8 0 0 0-1.8-1.8h-1.8M9.8 4h4.4a.9.9 0 0 1 .9.9v1.6H8.9V4.9A.9.9 0 0 1 9.8 4M9.2 11.4h5.6M9.2 15.2h3.6",
  book: "M12 7C10.5 5.5 8.6 4.8 5.6 4.8v11.6c3 0 4.9.7 6.4 2.2 1.5-1.5 3.4-2.2 6.4-2.2V4.8c-3 0-4.9.7-6.4 2.2M12 7v11.6",
  users: "M9.4 11.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2M3.2 20.4a6.2 6.2 0 0 1 12.4 0M16.6 5.2a3.6 3.6 0 0 1 0 6.8M17.8 14.4a6.2 6.2 0 0 1 3.4 6",
  user: "M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2M4.6 20.4a7.4 7.4 0 0 1 14.8 0",
  chart: "M4.6 19.4h14.8M7.6 16.4v-5.2M12 16.4V5.8M16.4 16.4v-3.4",
  bell: "M18.3 16.2c-.9-1.2-1.5-2.9-1.5-5.9a4.8 4.8 0 0 0-9.6 0c0 3-.6 4.7-1.5 5.9-.4.6 0 1.4.8 1.4h11c.8 0 1.2-.8.8-1.4M9.9 19.6a2.3 2.3 0 0 0 4.2 0",
  chevron: "M6.6 9.8 12 15.2l5.4-5.4",
  search: "M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6M15.9 15.9 20.4 20.4",
  filter: "M4.6 5.6h14.8l-5.8 6.8v5.4L10.4 19.4v-7z",
  download: "M12 4.6v10.6M8.3 11.5 12 15.2l3.7-3.7M4.6 19.4h14.8",
  logout: "M14.4 4.6h3.4a1.8 1.8 0 0 1 1.8 1.8v11.2a1.8 1.8 0 0 1-1.8 1.8h-3.4M10 8.3 6.3 12l3.7 3.7M6.3 12h8.4",
  plus: "M12 5.4v13.2M5.4 12h13.2",
  globe: "M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8M4 9.4h16M4 14.6h16M12 3.6c2.5 2.8 2.5 14 0 16.8M12 3.6c-2.5 2.8-2.5 14 0 16.8",
  sun: "M12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4M12 3v1.8M12 19.2V21M5.6 5.6l1.3 1.3M17.1 17.1l1.3 1.3M3 12h1.8M19.2 12H21M5.6 18.4l1.3-1.3M17.1 6.9l1.3-1.3",
  moon: "M19.8 14.6A8.2 8.2 0 0 1 9.4 4.2a8.2 8.2 0 1 0 10.4 10.4",
} as const;

export type NavIconName = keyof typeof NAV_ICON_PATHS;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={NAV_ICON_PATHS[name]} />
    </svg>
  );
}
