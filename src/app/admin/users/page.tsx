import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AssignSpecialistForm } from "./assign-specialist-form";
import { ManageUsersPanel } from "./manage-users-panel";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

/**
 * Batch 3: restructured to match the mockup's "تعيين مختص" screen — a
 * two-panel layout instead of the old stacked create-user / full-table /
 * assign-form page. Same route (/admin/users) and same server actions
 * (actions.ts, untouched); only the presentation changed. The nav label
 * moved from "User Management" to "Assign specialist" to match the
 * mockup's 3-item admin nav (see admin/layout.tsx).
 *
 * Batch 7 (issues D/E/F): batch 6 had briefly split this into a
 * collapsible "إدارة المستخدمين" card PLUS a separate compact
 * "المستخدمون" read-only list card with its own search filter — two
 * places showing overlapping user data. Collapsed back into ONE always-
 * expanded "إدارة المستخدمين" card (left column, below the assign form),
 * with the search filter now filtering that real management table
 * directly (ManageUsersPanel) instead of a separate read-only copy. The
 * right column is gone entirely.
 */
export default async function AdminUsersPage() {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminUsers");
  const tRoles = await getTranslations("Common.roles");

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { studentProfile: { select: { id: true, studentNumber: true, requestStatus: true } } },
  });

  const assignments = await db.specialistAssignment.findMany({
    include: {
      specialist: { select: { email: true, fullName: true } },
      studentProfile: { include: { user: { select: { email: true, fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const caseloadBySpecialistId = new Map<string, number>();
  for (const a of assignments) {
    caseloadBySpecialistId.set(a.specialistUserId, (caseloadBySpecialistId.get(a.specialistUserId) ?? 0) + 1);
  }

  const specialists = users
    .filter((u) => u.role === "specialist" && u.active)
    .map((u) => ({
      id: u.id,
      label: `${u.fullName} (${u.email}) — ${t("specialistCurrentLoad", { count: caseloadBySpecialistId.get(u.id) ?? 0 })}`,
    }));

  const students = users
    .filter((u) => u.role === "student" && u.active && u.studentProfile)
    .map((u) => ({
      id: u.studentProfile!.id,
      label: `${u.fullName} (${u.studentProfile!.studentNumber || "—"}) — ${u.email}`,
    }));

  const assignedStudentProfileIds = new Set(assignments.map((a) => a.studentProfileId));
  const needsAssignmentStudentProfileIds = new Set(
    users
      .filter(
        (u) =>
          u.role === "student" &&
          u.studentProfile &&
          (u.studentProfile.requestStatus === "pending" || !assignedStudentProfileIds.has(u.studentProfile.id))
      )
      .map((u) => u.studentProfile!.id)
  );

  const navItems = await getAdminNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
    <div className="space-y-6">
      {needsAssignmentStudentProfileIds.size > 0 && (
        <Badge variant="destructive" className="text-sm">
          {t("needsAssignmentCount", { count: needsAssignmentStudentProfileIds.size })}
        </Badge>
      )}

      {/* No EchoCard on this screen — the mockup's "تعيين مختص" view has no
          bento hero card at all (no stat number makes sense here), same as
          the audit-log screen. Batch 7: single column now — the separate
          right-side users-list card is gone (issue E), merged into the
          "إدارة المستخدمين" card below. */}
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("assignSpecialistTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("assignSpecialistNote")}</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <AssignSpecialistForm specialists={specialists} students={students} />

            {assignments.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("tableSpecialist")}</TableHead>
                      <TableHead>{t("tableStudent")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => (
                      <TableRow key={a.id}>
                        {/* whitespace-normal + break-words: TableCell's
                            default is whitespace-nowrap, which is fine
                            for normal names/emails but this table can
                            show a long unbroken placeholder identifier
                            (e.g. a stray fixture's fallback name) that
                            would otherwise force this single cell's
                            column to expand without bound, squeezing the
                            whole row and reading as misaligned/jumbled —
                            reported as "مخبص". This wraps long content
                            within the column instead. Email stacks
                            directly below the name in the SAME cell (not
                            beside it) via separate block-level <p> tags —
                            re-verified per issue G, this was already
                            correct; the earlier report was almost
                            certainly the pre-cleanup stray fixture rows'
                            very long placeholder identifiers (issue C)
                            visually distorting the row, not a real
                            alignment bug. */}
                        <TableCell className="whitespace-normal break-words">
                          <p>{a.specialist.fullName}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {a.specialist.email}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-normal break-words">
                          <p>{a.studentProfile.user.fullName}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {a.studentProfile.user.email}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Hidden note: this screen never reads a student's
                classification/support level anywhere — assignment doesn't
                need it, matching the mockup's own note for this screen. */}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
              {t("hiddenNote")}
            </p>
          </CardContent>
        </Card>

        {/* Batch 7 (issues D/E/F): always-expanded now (no <details>
            disclosure), and the ONLY user list on this page — the search
            filter that used to live in a separate compact list card now
            filters this real management table directly. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("manageUsersTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ManageUsersPanel
              users={users.map((u) => ({
                id: u.id,
                fullName: u.fullName,
                email: u.email,
                role: u.role,
                roleLabel: tRoles(u.role),
                active: u.active,
                needsAssignment: u.studentProfile != null && needsAssignmentStudentProfileIds.has(u.studentProfile.id),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
    </AppShell>
  );
}
