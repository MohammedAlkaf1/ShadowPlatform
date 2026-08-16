import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import { AssignSpecialistForm } from "./assign-specialist-form";
import { UsersListPanel } from "./users-list-panel";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

/**
 * Batch 3: restructured to match the mockup's "تعيين مختص" screen — a
 * two-panel layout (assign form + a compact users reference list) instead
 * of the old stacked create-user / full-table / assign-form page. Same
 * route (/admin/users) and same server actions (actions.ts, untouched);
 * only the presentation changed. The nav label moved from "User Management"
 * to "Assign specialist" to match the mockup's 3-item admin nav (see
 * admin/layout.tsx).
 *
 * Batch 6: the collapsible "إدارة المستخدمين" block (create user, change
 * role, activate/deactivate) moved OUT of the right-side users-list card
 * into its own separate card in the LEFT column, stacked below the
 * assign-specialist form card — it was visually competing for space
 * inside the same card as the list. The right column is now just the
 * users-list card, which also gained a client-side name/email search
 * filter (UsersListPanel) — no functionality lost, just relocated.
 */
export default async function AdminUsersPage() {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminUsers");
  const tRoles = await getTranslations("Common.roles");
  const tActions = await getTranslations("Common.actions");

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
          the audit-log screen. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex flex-col gap-5 lg:flex-1">
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
                              (e.g. seed data's "unlinked-student-<uuid>"
                              fallback name) that would otherwise force this
                              single cell's column to expand without bound,
                              squeezing the whole row and reading as
                              misaligned/jumbled — reported as "مخبص". This
                              wraps long content within the column instead,
                              same stacked name/email <p><p> pattern used
                              elsewhere (e.g. specialist/queue/page.tsx). */}
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

          {/* Batch 6: moved here from inside the users-list card (was
              competing for space with the list there) — full user
              management (create user, change role, activate/deactivate),
              real functionality preserved, still tucked behind a native
              <details> disclosure. No JS needed for the toggle itself. */}
          <Card>
            <CardContent>
              <details className="rounded-lg border border-border">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                  {t("manageUsersToggle")}
                  <span aria-hidden="true">+</span>
                </summary>
                <div className="space-y-6 border-t border-border p-3">
                  <div>
                    <p className="mb-2 text-sm font-semibold">{t("addUserTitle")}</p>
                    <CreateUserForm />
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("tableUser")}</TableHead>
                          <TableHead>{t("tableRole")}</TableHead>
                          <TableHead>{t("tableStatus")}</TableHead>
                          <TableHead className="w-56">{t("tableActions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => {
                          const needsAssignment =
                            u.studentProfile != null && needsAssignmentStudentProfileIds.has(u.studentProfile.id);
                          return (
                            <TableRow key={u.id} className={needsAssignment ? "bg-destructive/5" : undefined}>
                              <TableCell className="font-medium">
                                <p>{u.fullName}</p>
                                <p dir="ltr" className="text-xs font-normal text-muted-foreground">
                                  {u.email}
                                </p>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{tRoles(u.role)}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant={u.active ? "secondary" : "destructive"}>
                                    {u.active ? tActions("active") : tActions("disabled")}
                                  </Badge>
                                  {needsAssignment && (
                                    <Badge variant="destructive">{t("needsAssignmentBadge")}</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <UserRowActions userId={u.id} role={u.role} active={u.active} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:w-[420px] lg:shrink-0">
          <CardHeader>
            <CardTitle className="text-base">{t("usersListTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("usersListSub")}</p>
          </CardHeader>
          <CardContent>
            <UsersListPanel
              users={users.map((u) => ({
                id: u.id,
                fullName: u.fullName,
                email: u.email,
                roleLabel: tRoles(u.role),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
    </AppShell>
  );
}
