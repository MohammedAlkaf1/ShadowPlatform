import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertRowActions } from "./alert-row-actions";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";
import { localize } from "@/lib/localize";

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEVERITY_TONE: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-accent/15 text-accent",
  low: "bg-muted text-muted-foreground",
};

export default async function SpecialistAlertsPage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistAlerts");
  const tSeverity = await getTranslations("Common.alertSeverity");
  const tStatus = await getTranslations("Common.alertStatus");
  const locale = await getLocale();

  const alerts = await db.mentorAlert.findMany({
    where: ctx.role === "admin" ? {} : { assignedSpecialistId: ctx.userId },
    include: {
      studentProfile: { include: { user: { select: { email: true, fullName: true, fullNameEn: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const sorted = [...alerts].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const navItems = await getSpecialistNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
    >
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("listTitle")} ({sorted.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noAlerts")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tableSeverity")}</TableHead>
                    <TableHead>{t("tableStudent")}</TableHead>
                    <TableHead>{t("tableType")}</TableHead>
                    <TableHead>{t("tableMessage")}</TableHead>
                    <TableHead>{t("tableStatus")}</TableHead>
                    <TableHead className="min-w-64">{t("tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell>
                        <Badge className={SEVERITY_TONE[alert.severity]} variant="secondary">
                          {tSeverity(alert.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {/* Batch 8: dir="ltr" on an inline span, not the
                            block <p> — see admin/audit-log/page.tsx. */}
                        <p className="text-sm font-medium">
                          {localize(alert.studentProfile.user.fullName, alert.studentProfile.user.fullNameEn, locale)}
                        </p>
                        <p className="text-xs text-muted-foreground">{alert.studentProfile.studentNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          <span dir="ltr">{alert.studentProfile.user.email}</span>
                        </p>
                      </TableCell>
                      {/* Batch 7: see table.tsx's updated comment — the
                          cell itself must not force dir="ltr"; only the
                          monospace code text gets the narrow wrap. */}
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <span dir="ltr">{alert.alertType}</span>
                      </TableCell>
                      <TableCell className="max-w-xs whitespace-pre-wrap text-sm">
                        {localize(alert.message, alert.messageEn, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tStatus(alert.status)}</Badge>
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
    </AppShell>
  );
}
