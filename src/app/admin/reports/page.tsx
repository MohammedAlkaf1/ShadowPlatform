import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default async function AdminReportsPage() {
  await requireRole("admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">التقارير</h1>
        <p className="mt-1 text-sm text-muted-foreground">تصدير تقارير إدارية لا تتضمن أي بيانات طبية</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تقرير الطلاب (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            يتضمن التقرير: اسم الطالب (البريد الإلكتروني)، حالة الطلب، تاريخ التسجيل، وحالة خطة الدعم فقط. لا يتضمن
            التصنيف أو مستوى الدعم أو ملاحظات التقييم أو أي بيانات طبية.
          </p>
          <Button render={<a href="/api/admin/export/students" download />} className="gap-2">
            <Download className="size-4" />
            تنزيل التقرير
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
