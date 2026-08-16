import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

export default async function AdminReportsPage() {
  const ctx = await requireRole("admin");
  const t = await getTranslations("AdminReports");
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("studentReportTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("studentReportDescription")}</p>
            {/* A download link styled as a button — see the comment in
                specialist/queue/page.tsx for why this uses buttonVariants
                directly on <a> instead of Button's `render` prop. */}
            <a href="/api/admin/export/students" download className={cn(buttonVariants(), "gap-2")}>
              <Download className="size-4" />
              {t("downloadButton")}
            </a>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
