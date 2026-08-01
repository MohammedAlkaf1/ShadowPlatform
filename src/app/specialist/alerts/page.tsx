import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertRowActions } from "./alert-row-actions";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_LABELS: Record<string, string> = { high: "مرتفعة", medium: "متوسطة", low: "منخفضة" };
const SEVERITY_TONE: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-accent/15 text-accent",
  low: "bg-muted text-muted-foreground",
};
const STATUS_LABELS: Record<string, string> = { open: "مفتوح", acknowledged: "تم الإقرار", resolved: "مغلق" };

export default async function SpecialistAlertsPage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);

  const alerts = await db.mentorAlert.findMany({
    where: ctx.role === "admin" ? {} : { assignedSpecialistId: ctx.userId },
    include: { studentProfile: { include: { user: { select: { email: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  const sorted = [...alerts].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">تنبيهات المتابعة</h1>
        <p className="mt-1 text-sm text-muted-foreground">تنبيهات ناتجة عن أنماط استخدام التطبيق لدى طلابك</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">التنبيهات ({sorted.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تنبيهات حالياً</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الخطورة</TableHead>
                    <TableHead>الطالب</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الرسالة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Badge className={SEVERITY_TONE[alert.severity]} variant="secondary">
                          {SEVERITY_LABELS[alert.severity]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{alert.studentProfile.studentNumber}</p>
                        <p dir="ltr" className="text-xs text-muted-foreground">
                          {alert.studentProfile.user.email}
                        </p>
                      </TableCell>
                      <TableCell dir="ltr" className="text-end font-mono text-xs text-muted-foreground">
                        {alert.alertType}
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-pre-wrap text-sm">{alert.message}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{STATUS_LABELS[alert.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        <AlertRowActions alertId={alert.id} status={alert.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
