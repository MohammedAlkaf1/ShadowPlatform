import type { ReactNode } from "react";
import { requireRolePage } from "@/lib/require-role-page";

/** See admin/layout.tsx's comment — batch 5 moved AppShell to page level. */
export default async function FacultyLayout({ children }: { children: ReactNode }) {
  await requireRolePage("faculty");
  return children;
}
