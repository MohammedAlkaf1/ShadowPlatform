import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default async function AdminReportsPage() {
  await requireRole("admin");
  const t = await getTranslations("AdminReports");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("studentReportTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("studentReportDescription")}</p>
          <Button render={<a href="/api/admin/export/students" download />} className="gap-2">
            <Download className="size-4" />
            {t("downloadButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
