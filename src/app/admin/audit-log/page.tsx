import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@prisma/client";

interface SearchParams {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
}

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
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.user.findMany({ select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);

  const actionOptions = Array.from(new Set(logs.map((l) => l.action))).sort();

  // Viewing the audit log is itself an access worth recording, without a
  // target student (this isn't scoped to one student's record).
  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_audit_log",
    resourceType: "AuditLog",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
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
                    {u.email}
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
                    {a}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("resultsTitle")} ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableDate")}</TableHead>
                  <TableHead>{t("tableUser")}</TableHead>
                  <TableHead>{t("tableAction")}</TableHead>
                  <TableHead>{t("tableResourceType")}</TableHead>
                  <TableHead>{t("tableTargetStudent")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    {/* dir="ltr" forces these to always render left-to-right (dates/
                        emails shouldn't get bidi-mirrored in an RTL page), and
                        text-start (not text-end) is deliberate: text-align:start
                        resolves against THIS element's own dir="ltr", so it always
                        computes to physical left — which is simultaneously "the end
                        edge" in an RTL page (matching the rest of the RTL table's
                        visual flow) and "the start edge" in an LTR page (matching
                        every other left-aligned column in English). text-end here
                        would instead always resolve to physical right, which is only
                        coincidentally correct in RTL and visibly wrong in LTR — that
                        was the actual cause of English-mode date columns still
                        looking RTL-aligned. */}
                    <TableCell dir="ltr" className="text-start text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt, locale)}
                    </TableCell>
                    <TableCell dir="ltr" className="text-start text-sm">
                      {log.actor.email}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.resourceType}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
