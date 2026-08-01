import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

const REQUEST_STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  under_review: "قيد المراجعة",
  approved: "مقبول",
  rejected: "مرفوض",
};

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  expired: "منتهية",
};

/**
 * GET /api/admin/export/students — CSV export for admins.
 *
 * HARD REQUIREMENT: columns are student identifier (email — the schema has
 * no separate "name" field, see report), request status, registration
 * date, and plan status ONLY. Category, condition, support level,
 * assessment notes, and anything else medical/diagnostic are deliberately
 * never queried here, not just omitted from the output — so there is no
 * risk of a future column addition accidentally leaking them from data
 * already in scope.
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

  const students = await db.studentProfile.findMany({
    where: { deletedAt: null },
    select: {
      requestStatus: true,
      createdAt: true,
      user: { select: { email: true } },
      supportPlans: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const headers = ["اسم الطالب", "حالة الطلب", "تاريخ التسجيل", "حالة خطة الدعم"];
  const rows = students.map((s) => [
    s.user.email,
    REQUEST_STATUS_LABELS[s.requestStatus] ?? s.requestStatus,
    s.createdAt.toISOString().slice(0, 10),
    s.supportPlans[0] ? PLAN_STATUS_LABELS[s.supportPlans[0].status] ?? s.supportPlans[0].status : "لا توجد خطة",
  ]);

  const csv = toCsv(headers, rows);

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "export_report",
    resourceType: "StudentProfile",
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-report-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
