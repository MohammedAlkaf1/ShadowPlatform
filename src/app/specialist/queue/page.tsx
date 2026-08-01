import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  under_review: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

export default async function SpecialistQueuePage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);

  // A specialist only ever sees students an admin has manually assigned to
  // them. Admins viewing this page see the whole tenant's queue instead.
  const assignments = await db.specialistAssignment.findMany({
    where: ctx.role === "admin" ? {} : { specialistUserId: ctx.userId },
    include: {
      studentProfile: {
        include: { user: { select: { email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">قائمة المراجعة</h1>
        <p className="mt-1 text-sm text-muted-foreground">الطلاب المُحالون إليك من قِبل مسؤول النظام</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الطلاب ({assignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا يوجد طلاب محالون إليك حالياً</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرقم الجامعي</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>التخصص</TableHead>
                  <TableHead>حالة الطلب</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.studentProfile.studentNumber}</TableCell>
                    <TableCell dir="ltr" className="text-end text-muted-foreground">
                      {a.studentProfile.user.email}
                    </TableCell>
                    <TableCell>{a.studentProfile.major}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{STATUS_LABELS[a.studentProfile.requestStatus]}</Badge>
                    </TableCell>
                    <TableCell className="flex gap-2">
                      <Button size="sm" variant="outline" render={
                        <Link href={`/specialist/students/${a.studentProfile.id}/assess`}>التقييم</Link>
                      } />
                      <Button size="sm" render={
                        <Link href={`/specialist/students/${a.studentProfile.id}/plan`}>خطة الدعم</Link>
                      } />
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
