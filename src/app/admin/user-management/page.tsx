import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { cn } from "@/lib/utils";
import { localize } from "@/lib/localize";
import { ManageUsersPanel } from "../users/manage-users-panel";
import { RequestsTable } from "./requests-table";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

const TABS = ["requests", "accounts"] as const;
type Tab = (typeof TABS)[number];

/**
 * "الطلبات" tab: the reference's isUsers screen shows a generic staff
 * account-request queue (new specialist accounts, role-change requests,
 * disable requests) — a workflow this app's schema has no real model for.
 * Per explicit direction, this tab renders that queue as UI mock data
 * (see requests-table.tsx) rather than mapping it onto real student
 * records; approve/reject only mutate local component state.
 */
export default async function AdminManageUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminManageUsers");
  const tAdminUsers = await getTranslations("AdminUsers");
  const tRoles = await getTranslations("Common.roles");
  const locale = await getLocale();
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "requests";

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { studentProfile: { select: { id: true, studentNumber: true, requestStatus: true } } },
  });

  const assignments = await db.specialistAssignment.findMany({ select: { studentProfileId: true } });
  const assignedStudentProfileIds = new Set(assignments.map((a) => a.studentProfileId));

  const navItems = await getAdminNavItems();

  function tabHref(tb: Tab) {
    return tb === "requests" ? "/admin/user-management" : `/admin/user-management?tab=${tb}`;
  }

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
      <div className="flex w-fit gap-[3px] rounded-xl bg-foreground/[.08] p-[3px]">
        {TABS.map((tb) => (
          <Link
            key={tb}
            href={tabHref(tb)}
            className={cn(
              "flex min-h-[38px] items-center rounded-lg px-[18px] text-[13.5px] font-bold",
              tb === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {t(`tab_${tb}`)}
          </Link>
        ))}
      </div>

      {tab === "requests" ? (
        <div className="mt-4">
          <RequestsTable />
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
          <ManageUsersPanel
            currentUserId={ctx.userId}
            users={users.map((u) => ({
              id: u.id,
              fullName: u.fullName,
              fullNameEn: u.fullNameEn,
              displayName: localize(u.fullName, u.fullNameEn, locale),
              email: u.email,
              role: u.role,
              roleLabel: tRoles(u.role),
              org: u.role === "admin" ? tAdminUsers("orgPlatformAdmin") : (ctx.tenantName ?? ""),
              active: u.active,
              needsAssignment:
                u.studentProfile != null &&
                (u.studentProfile.requestStatus === "pending" || !assignedStudentProfileIds.has(u.studentProfile.id)),
              studentNumber: u.studentProfile?.studentNumber ?? null,
            }))}
          />
        </div>
      )}
    </AppShell>
  );
}
