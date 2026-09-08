import { NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { localize } from "@/lib/localize";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

/**
 * GET /api/admin/export/audit-log — real CSV export of the audit log
 * itself. The "تصدير السجل CSV" button on /admin/audit-log previously
 * pointed at /api/admin/export/students (a copy-paste from the reports
 * page) — genuinely wrong data for a button labeled "export the log".
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireRole("admin");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);

  const logs = await db.auditLog.findMany({
    include: {
      actor: { select: { fullName: true, fullNameEn: true, email: true, role: true } },
      targetStudentProfile: { select: { user: { select: { fullName: true, fullNameEn: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const locale = await getLocale();
  const t = await getTranslations("Common.csvExports");
  const headers = [t("headerTime"), t("headerUser"), t("headerEmail"), t("headerAction"), t("headerRelatedStudent")];
  const rows = logs.map((l) => [
    l.createdAt.toISOString(),
    localize(l.actor.fullName, l.actor.fullNameEn, locale),
    l.actor.email,
    l.action,
    l.targetStudentProfile ? localize(l.targetStudentProfile.user.fullName, l.targetStudentProfile.user.fullNameEn, locale) : "—",
  ]);

  const csv = toCsv(headers, rows);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "export_report",
    resourceType: "AuditLog",
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
