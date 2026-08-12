import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import { AssignSpecialistForm } from "./assign-specialist-form";

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

  const specialists = users
    .filter((u) => u.role === "specialist" && u.active)
    .map((u) => ({ id: u.id, label: u.email }));

  const students = users
    .filter((u) => u.role === "student" && u.active && u.studentProfile)
    .map((u) => ({ id: u.studentProfile!.id, label: `${u.email} (${u.studentProfile!.studentNumber || "—"})` }));

  const assignments = await db.specialistAssignment.findMany({
    include: {
      specialist: { select: { email: true } },
      studentProfile: { include: { user: { select: { email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Minimal visibility for the "which students need a specialist assigned"
  // workflow gap: a student needs attention if their request is still
  // pending OR no SpecialistAssignment exists for them yet at all (a
  // request can move past "pending" via other steps while still having
  // no assignment, so this is deliberately an OR, not just a status
  // check). This reads entirely off data already fetched on this page —
  // no new query, no new page, just a derived count + a per-row badge.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("addUserTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("usersListTitle")} ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableEmail")}</TableHead>
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
                  {/* text-start (not text-end) with dir="ltr" — see the comment in
                      admin/audit-log/page.tsx: this always resolves to physical
                      left, which is correct in both languages, not just RTL. */}
                  <TableCell dir="ltr" className="text-start font-medium">
                    {u.email}
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("assignSpecialistTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t("assignSpecialistNote")}</p>
          <AssignSpecialistForm specialists={specialists} students={students} />

          {assignments.length > 0 && (
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
                    {/* text-start with dir="ltr" — see admin/audit-log/page.tsx. */}
                    <TableCell dir="ltr" className="text-start">
                      {a.specialist.email}
                    </TableCell>
                    <TableCell dir="ltr" className="text-start">
                      {a.studentProfile.user.email}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
