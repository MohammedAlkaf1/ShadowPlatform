import type { ReactNode } from "react";
import { requireRolePage } from "@/lib/require-role-page";

/**
 * Batch 5: this layout no longer renders AppShell itself — each page.tsx
 * under /admin now calls <AppShell> directly so it can pass its own
 * title/subtitle into the shared header (see app-shell.tsx's comment for
 * why). This layout still runs the auth guard unconditionally for every
 * page under this segment (defense-in-depth on top of middleware.ts and
 * each page's own requireRole call) — it just no longer wraps `children`
 * in any visual chrome.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRolePage("admin");
  return children;
}
