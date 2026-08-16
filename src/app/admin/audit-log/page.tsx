import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";

interface SearchParams {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/**
 * Batch 3: redesigned to match the mockup's audit-log screen exactly —
 * table-only, NO bento hero (the mockup's "isAudit" section has no echo
 * card / hero row at all, unlike the dashboard screens), with ONE
 * terracotta "تصدير السجل CSV" button above the table. That button reuses
 * the SAME export mechanism /admin/reports already has (GET
 * /api/admin/export/students) rather than duplicating export logic — see
 * the report for why /admin/reports itself is no longer a separate nav
 * item (the mockup's 3-item admin nav has no "Reports" entry; the page
 * still exists at its old URL, just unlinked from the nav).
 */
export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireRole("admin");
  const params = await searchParams;
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AuditLog");
  const tActions = await getTranslations("Common.actions");
  const tAuditActions = await getTranslations("Common.auditActions");
  const tRoles = await getTranslations("Common.roles");
  const locale = await getLocale();

  const where: Prisma.AuditLogWhereInput = {};
  if (params.actorUserId) where.actorUserId = params.actorUserId;
  if (params.action) where.action = params.action;
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999Z`) } : {}),
    };
  }

  const [logs, users] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { email: true, fullName: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.user.findMany({ select: { id: true, email: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);

  const actionOptions = Array.from(new Set(logs.map((l) => l.action))).sort();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_audit_log",
    resourceType: "AuditLog",
  });

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
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* The one terracotta action on this screen. */}
        <a
          href="/api/admin/export/students"
          download
          className={cn(buttonVariants({ variant: "accent" }), "gap-2 min-h-11")}
        >
          <Download className="size-4" />
          {t("exportCsvButton")}
        </a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("filterTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="grid gap-4 sm:grid-cols-5 sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="actorUserId">{t("userLabel")}</Label>
              <select
                id="actorUserId"
                name="actorUserId"
                defaultValue={params.actorUserId ?? ""}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{tActions("all")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="action">{t("actionLabel")}</Label>
              <select
                id="action"
                name="action"
                defaultValue={params.action ?? ""}
                className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{tActions("all")}</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {tAuditActions.has(a) ? tAuditActions(a) : a}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">{t("fromLabel")}</Label>
              <Input id="from" name="from" type="date" defaultValue={params.from ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">{t("toLabel")}</Label>
              <Input id="to" name="to" type="date" defaultValue={params.to ?? ""} />
            </div>
            <Button type="submit">{tActions("apply")}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableDate")}</TableHead>
                <TableHead>{t("tableUser")}</TableHead>
                <TableHead>{t("tableAction")}</TableHead>
                <TableHead>{t("tableTargetStudent")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  {/* dir="ltr" + text-start — see the long-standing comment
                      this used to carry here: text-align:start resolves
                      against THIS element's own dir="ltr", so it always
                      computes to physical left, which is simultaneously
                      correct in both RTL and LTR page contexts. */}
                  <TableCell dir="ltr" className="text-start text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <p>
                      {log.actor.fullName} — <span className="text-muted-foreground">{tRoles(log.actor.role)}</span>
                    </p>
                    <p dir="ltr" className="text-xs text-muted-foreground">
                      {log.actor.email}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">{tAuditActions.has(log.action) ? tAuditActions(log.action) : log.action}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.targetStudentProfileId ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {logs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          )}
        </div>
      </div>

      {/* Hidden note: matches the mockup's exact framing for this screen —
          the log is genuinely append-only (no delete path exists anywhere
          in this codebase for AuditLog), and it is admin-only. */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-[7px] shrink-0 rounded-full bg-muted-foreground" />
        {t("readOnlyNote")}
      </p>
    </div>
    </AppShell>
  );
}
