import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  expired: "منتهية",
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
        include: {
          user: { select: { email: true } },
          assessments: {
            orderBy: { assessedAt: "desc" },
            take: 1,
            include: { condition: { include: { category: true } }, supportLevel: true },
          },
          supportPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
          mentorAlerts: { where: { status: "open" }, select: { id: true } },
        },
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الطالب</TableHead>
                    <TableHead>الفئة</TableHead>
                    <TableHead>مستوى الدعم</TableHead>
                    <TableHead>آخر تقييم</TableHead>
                    <TableHead>حالة الخطة</TableHead>
                    <TableHead>تنبيهات مفتوحة</TableHead>
                    <TableHead className="w-72">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const sp = a.studentProfile;
                    const lastAssessment = sp.assessments[0];
                    const lastPlan = sp.supportPlans[0];
                    const openAlertCount = sp.mentorAlerts.length;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <p className="font-medium">{sp.studentNumber}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {sp.user.email}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? (
                            <>
                              <p>{lastAssessment.condition.category.nameAr}</p>
                              <p className="text-xs text-muted-foreground">{lastAssessment.condition.nameAr}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">لا يوجد تقييم بعد</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{lastAssessment?.supportLevel.nameAr ?? "—"}</TableCell>
                        <TableCell dir="ltr" className="text-end text-sm text-muted-foreground">
                          {lastAssessment ? lastAssessment.assessedAt.toLocaleDateString("ar-SA") : "—"}
                        </TableCell>
                        <TableCell>
                          {lastPlan ? (
                            <Badge variant="secondary">{PLAN_STATUS_LABELS[lastPlan.status]}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">لا توجد خطة</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {openAlertCount > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="size-3" />
                              {openAlertCount}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              render={<Link href={`/specialist/students/${sp.id}`}>التفاصيل</Link>}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              render={<Link href={`/specialist/students/${sp.id}/assess`}>التقييم</Link>}
                            />
                            <Button size="sm" render={<Link href={`/specialist/students/${sp.id}/plan`}>خطة الدعم</Link>} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
