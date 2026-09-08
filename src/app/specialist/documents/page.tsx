import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";

/**
 * Sidebar "مراجعة وثيقة" destination: jumps straight into the standalone
 * two-column review screen for the oldest document still awaiting
 * classification (FIFO — review what's been waiting longest first), rather
 * than showing a generic table first. Falls back to an empty state only
 * when there is truly nothing left to review.
 */
export default async function SpecialistDocumentsPage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistDocuments");
  const isAdminViewing = ctx.role === "admin";

  const nextPending = await db.document.findFirst({
    where: {
      deletedAt: null,
      status: "pending",
      studentProfile: isAdminViewing ? {} : { specialistAssignments: { some: { specialistUserId: ctx.userId } } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (nextPending) {
    redirect(`/specialist/documents/${nextPending.id}`);
  }

  const navItems = await getSpecialistNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("listTitle")}
      subtitle=""
    >
      <div className="mx-auto max-w-5xl">
        <p className="rounded-[18px] border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
          {t("noDocuments")}
        </p>
      </div>
    </AppShell>
  );
}
