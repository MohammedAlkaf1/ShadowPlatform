import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";

const eventSchema = z.object({
  eventType: z.string().min(1),
  payload: z.unknown().optional(),
  occurredAt: z.string().datetime(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(200),
});

/**
 * POST /api/events — batch ingestion of usage events reported by the
 * Flutter app for the calling student. These feed the specialist's usage
 * dashboard and mentor alerts.
 */
export async function POST(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    return NextResponse.json({ error: "الملف الشخصي غير موجود" }, { status: 404 });
  }

  await db.usageEvent.createMany({
    data: parsed.data.events.map((e) => ({
      tenantId: ctx.tenantId,
      studentProfileId: studentProfile.id,
      eventType: e.eventType,
      payload: e.payload as object | undefined,
      occurredAt: new Date(e.occurredAt),
    })),
  });

  return NextResponse.json({ ok: true, received: parsed.data.events.length });
}
