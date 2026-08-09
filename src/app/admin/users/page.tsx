import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import { AssignSpecialistForm } from "./assign-specialist-form";

const ROLE_LABELS: Record<string, string> = {
  student: "طالب",
  faculty: "عضو هيئة تدريس",
  specialist: "مختص",
  admin: "مسؤول النظام",
};

export default async function AdminUsersPage() {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { studentProfile: { select: { id: true, studentNumber: true } } },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">إدارة المستخدمين</h1>
        <p className="mt-1 text-sm text-muted-foreground">إضافة وتعديل صلاحيات المستخدمين داخل الجامعة</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">إضافة مستخدم جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">المستخدمون ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="w-56">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell dir="ltr" className="text-end font-medium">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "secondary" : "destructive"}>{u.active ? "نشط" : "معطّل"}</Badge>
                  </TableCell>
                  <TableCell>
                    <UserRowActions userId={u.id} role={u.role} active={u.active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تعيين المختصين للطلاب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            التعيين هنا يدوي بالكامل — لا يتم ربط أي طالب بمختص تلقائياً. المختص لا يرى إلا الطلاب المعيّنين له.
          </p>
          <AssignSpecialistForm specialists={specialists} students={students} />

          {assignments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المختص</TableHead>
                  <TableHead>الطالب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell dir="ltr" className="text-end">
                      {a.specialist.email}
                    </TableCell>
                    <TableCell dir="ltr" className="text-end">
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
