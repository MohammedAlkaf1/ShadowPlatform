import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import { AssignSpecialistForm } from "./assign-specialist-form";

/**
 * Batch 3: restructured to match the mockup's "تعيين مختص" screen — a
 * two-panel layout (assign form + a compact users reference list) instead
 * of the old stacked create-user / full-table / assign-form page. Same
 * route (/admin/users) and same server actions (actions.ts, untouched);
 * only the presentation changed. The nav label moved from "User Management"
 * to "Assign specialist" to match the mockup's 3-item admin nav (see
 * admin/layout.tsx) — this screen still doubles as user management via the
 * collapsible "manage users" section below the compact list, so no
 * functionality (create user, change role, activate/deactivate) is lost,
 * just relocated so it doesn't visually compete with the primary
 * assign-a-specialist task.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {needsAssignmentStudentProfileIds.size > 0 && (
        <Badge variant="destructive" className="text-sm">
          {t("needsAssignmentCount", { count: needsAssignmentStudentProfileIds.size })}
        </Badge>
      )}

      {/* No EchoCard on this screen — the mockup's "تعيين مختص" view has no
          bento hero card at all (no stat number makes sense here), same as
          the audit-log screen. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <Card className="lg:flex-1">
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
                        <TableCell>
                          <p>{a.specialist.fullName}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {a.specialist.email}
                          </p>
                        </TableCell>
                        <TableCell>
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
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              {t("hiddenNote")}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:w-[420px] lg:shrink-0">
          <CardHeader>
            <CardTitle className="text-base">{t("usersListTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("usersListSub")}</p>
          </CardHeader>
          <CardContent className="space-y-1">
            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-pretty">{u.fullName}</p>
                    <p dir="ltr" className="text-xs text-muted-foreground text-pretty">
                      {u.email}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{tRoles(u.role)}</span>
                </li>
              ))}
            </ul>

            {/* Full user management (create user, change role, activate/
                deactivate) — real functionality preserved, just tucked
                behind a native <details> disclosure so it doesn't compete
                visually with the primary assign-a-specialist task on this
                screen. No JS needed for the toggle itself. */}
            <details className="mt-4 rounded-lg border border-border">
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
                                {needsAssignment && <Badge variant="destructive">{t("needsAssignmentBadge")}</Badge>}
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
    </div>
  );
}
