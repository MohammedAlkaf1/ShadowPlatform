import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, verifyMobileToken } from "@/lib/mobile-jwt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  refreshToken: z.string().min(1),
});

// Guessing/brute-forcing a valid refresh token isn't practical (128+ bits of
// signature entropy), but this still throttles a leaked/replayed token being
// hammered and caps the cost of repeated verify + DB-lookup work per IP.
const REFRESH_RATE_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };

/** POST /api/auth/refresh — exchanges a valid refresh token for a new access token. */
export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`auth-refresh:${getClientIp(request)}`, REFRESH_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "عدد الطلبات كبير جداً، الرجاء المحاولة لاحقاً" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) },
      }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  try {
    const claims = await verifyMobileToken(parsed.data.refreshToken);
    if (claims.type !== "refresh") {
      return NextResponse.json({ error: "رمز التحديث غير صالح" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: claims.userId } });
    if (!user || !user.active || user.deletedAt || user.tenantId !== claims.tenantId) {
      return NextResponse.json({ error: "الحساب غير نشط" }, { status: 401 });
    }
    // Revocation check BEFORE issuing a new access token — a refresh token
    // minted under an older tokenVersion (e.g. from before a "sign out
    // everywhere") must not be able to mint fresh access tokens just
    // because its own signature/expiry are still otherwise valid.
    if (user.tokenVersion !== claims.tokenVersion) {
      return NextResponse.json({ error: "تم إبطال رمز التحديث هذا" }, { status: 401 });
    }

    const accessToken = await signAccessToken({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "رمز التحديث غير صالح أو منتهي" }, { status: 401 });
  }
}
