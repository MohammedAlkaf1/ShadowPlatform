import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { checkRateLimit } from "@/lib/rate-limit";

const eventSchema = z.object({
  eventType: z.string().min(1),
  payload: z.unknown().optional(),
  occurredAt: z.string().datetime(),
});

const bodySchema = z.object({
  events: z.array(eventSchema).min(1).max(200),
});

/**
 * Rate limit: 20 requests per 60-second window per authenticated user.
 *
 * The app is expected to call this at most once per 60 seconds (buffered
 * batch flush) or once per mode-screen close, whichever comes first — in
 * normal use that's a handful of calls per minute at most. 20/min gives
 * generous headroom for a student rapidly opening/closing several modes
 * plus a couple of retries, while still stopping a malfunctioning or
 * loop-stuck client from flooding the server. In-memory (see
 * src/lib/rate-limit.ts) — fine for this single-process deployment stage.
 */
const EVENTS_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

/**
 * POST /api/events — batch ingestion of usage events reported by the
 * Flutter app for the calling student. These feed the specialist's usage
 * dashboard and mentor alerts. Accepts an ARRAY of events in one request
 * (the app buffers and flushes in batches, not one call per event).
 */
export async function POST(request: Request) {
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`events:${ctx.userId}`, EVENTS_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "عدد الطلبات كبير جداً، الرجاء المحاولة لاحقاً" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

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
