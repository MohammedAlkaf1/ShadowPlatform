import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { formatRelativeDay } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, Eye, List, ShieldAlert, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";
import { localize } from "@/lib/localize";

const PAGE_SIZE = 6;

interface SearchParams {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  student?: string;
  page?: string;
}

type Category = "plan" | "view" | "upload" | "assign" | "export";

// Reference: 4 category badges (green/gray/blue-gray/orange). Every real
// action string in Common.auditActions maps into one of these 5 buckets —
// "view" is the catch-all for anything that isn't a plan/upload/assign/
// export action, matching the reference's own "اطلاع" bucket being the
// largest/default category.
const CATEGORY_BY_ACTION: Record<string, Category> = {
  approve_support_plan: "plan",
  create_support_plan: "plan",
  revise_support_plan: "plan",
  upload_document: "upload",
  upload_faculty_resource: "upload",
  assign_specialist: "assign",
  export_report: "export",
};

const CATEGORY_BADGE: Record<Category, string> = {
  plan: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  view: "bg-muted text-muted-foreground",
  upload: "bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  assign: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-400",
  export: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-400",
};

/**
 * Batch 3's original redesign matched an older 3-item-nav mockup (table
 * only, no stats). The current reference adds a 4-card stats row above the
 * filter card, an expandable-row chevron, a category badge column, and
 * relative-day timestamps — this rewrite adds all of that with real
 * computed data (no fabricated counts).
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
  if (params.student) where.targetStudentProfileId = params.student;
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(`${params.to}T23:59:59.999Z`) } : {}),
    };
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const page = Math.max(1, Number(params.page) || 1);

  const [logs, filteredCount, distinctActionRows, users, totalCount, viewsTodayCount, exportsCount, rejectedCount] =
    await Promise.all([
      db.auditLog.findMany({
        where,
        include: {
          actor: { select: { email: true, fullName: true, fullNameEn: true, role: true } },
          targetStudentProfile: { select: { user: { select: { fullName: true, fullNameEn: true } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        // ipAddress/userAgent/sessionId/logHash come along automatically via
        // `include` (it doesn't restrict AuditLog's own scalar columns).
      }),
      db.auditLog.count({ where }),
      // Independent of pagination/filters, so the "نوع الإجراء" filter
      // dropdown always lists every action that has ever occurred — not
      // just the ones on the current page.
      db.auditLog.findMany({ select: { action: true }, distinct: ["action"] }),
      db.user.findMany({ select: { id: true, email: true, fullName: true, fullNameEn: true }, orderBy: { fullName: "asc" } }),
      db.auditLog.count(),
      db.auditLog.count({
        where: { createdAt: { gte: startOfToday }, action: { startsWith: "view_", not: "view_document_denied" } },
      }),
      db.auditLog.count({ where: { action: "export_report" } }),
      db.auditLog.count({ where: { action: "view_document_denied" } }),
    ]);

  const actionOptions = distinctActionRows.map((r) => r.action).sort();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_audit_log",
    resourceType: "AuditLog",
  });

  const navItems = await getAdminNavItems();

  function pageHref(targetPage: number) {
    const qs = new URLSearchParams();
    if (params.actorUserId) qs.set("actorUserId", params.actorUserId);
    if (params.action) qs.set("action", params.action);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.student) qs.set("student", params.student);
    qs.set("page", String(targetPage));
    return `/admin/audit-log?${qs.toString()}`;
  }

  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, filteredCount);

  const statCards = [
    { label: t("statTotal"), value: totalCount, icon: List },
    { label: t("statViewsToday"), value: viewsTodayCount, icon: Eye },
    { label: t("statExports"), value: exportsCount, icon: Download },
    { label: t("statRejected"), value: rejectedCount, icon: ShieldAlert },
  ];

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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* The one terracotta action on this screen. */}
          <a
            href="/api/admin/export/audit-log"
            download
            className={cn(buttonVariants({ variant: "accent" }), "gap-2 min-h-11")}
          >
            <Download className="size-4" />
            {t("exportCsvButton")}
          </a>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-3.5 rounded-[18px] border border-border bg-card p-[18px] shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground/[.08] text-foreground">
                <s.icon className="size-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="text-[11.5px] font-bold text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-extrabold tabular-nums">{s.value}</p>
              </div>
            </div>
          ))}
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
                      {localize(u.fullName, u.fullNameEn, locale)} ({u.email})
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
                <Input id="from" name="from" type="date" placeholder={t("datePlaceholder")} defaultValue={params.from ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to">{t("toLabel")}</Label>
                <Input id="to" name="to" type="date" placeholder={t("datePlaceholder")} defaultValue={params.to ?? ""} />
              </div>
              <Button type="submit">{tActions("apply")}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
          <div className="overflow-x-auto">
            <div className="flex items-center gap-4 bg-muted/40 px-5 py-2.5 text-[11px] font-bold text-muted-foreground">
              <div className="w-5 shrink-0" />
              <div className="flex-1">{t("tableDate")}</div>
              <div className="flex-[1.6]">{t("tableUser")}</div>
              <div className="flex-[1.1]">{t("tableCategory")}</div>
              <div className="flex-[2]">{t("tableAction")}</div>
              <div className="flex-[1.3]">{t("tableTargetStudent")}</div>
            </div>
            {logs.map((log) => {
              const category = CATEGORY_BY_ACTION[log.action] ?? "view";
              return (
                <details key={log.id} className="group border-b border-border last:border-0 open:bg-muted/30">
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3.5 hover:bg-muted/30 group-open:bg-muted/40">
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    <div className="flex-1 text-xs text-muted-foreground">
                      <span dir="ltr">{formatRelativeDay(log.createdAt, locale, t("today"), t("yesterday"))}</span>
                    </div>
                    <div className="flex-[1.6] text-sm font-medium">
                      {localize(log.actor.fullName, log.actor.fullNameEn, locale)} - {tRoles(log.actor.role)}
                    </div>
                    <div className="flex-[1.1]">
                      <span className={cn("inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold", CATEGORY_BADGE[category])}>
                        {t(`category_${category}`)}
                      </span>
                    </div>
                    <div className="flex-[2] text-sm">{tAuditActions.has(log.action) ? tAuditActions(log.action) : log.action}</div>
                    <div className="flex-[1.3] text-sm text-muted-foreground">
                      {log.targetStudentProfile
                        ? localize(log.targetStudentProfile.user.fullName, log.targetStudentProfile.user.fullNameEn, locale)
                        : "—"}
                    </div>
                  </summary>
                  <div className="border-t border-border bg-muted/40 px-5 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
                      <p className="shrink-0 text-xs font-bold text-muted-foreground sm:w-28">{t("sessionDetailsTitle")}</p>
                      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                        {[
                          { label: t("sdIp"), value: log.ipAddress },
                          { label: t("sdDevice"), value: log.userAgent },
                          { label: t("sdSessionId"), value: log.sessionId },
                          { label: t("sdLogHash"), value: log.logHash ? `${log.logHash.slice(0, 4)}...${log.logHash.slice(-4)}` : null },
                        ].map((field) => (
                          <div key={field.label}>
                            <p className="text-[11px] text-muted-foreground">{field.label}</p>
                            <p className="mt-0.5 text-sm font-medium text-foreground/80" dir="ltr">
                              {field.value ?? "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          {logs.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          )}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {t("footerRange", { start: rangeStart, end: rangeEnd, total: filteredCount })}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={pageHref(page + 1)}
                aria-disabled={page >= totalPages}
                className={cn(
                  buttonVariants({ variant: "outline", size: "icon" }),
                  "rounded-xl",
                  page >= totalPages && "pointer-events-none opacity-40"
                )}
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                href={pageHref(page - 1)}
                aria-disabled={page <= 1}
                className={cn(
                  buttonVariants({ variant: "outline", size: "icon" }),
                  "rounded-xl",
                  page <= 1 && "pointer-events-none opacity-40"
                )}
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
