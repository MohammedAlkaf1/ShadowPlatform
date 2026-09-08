import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/mobile-jwt";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/login — issues an access + refresh JWT pair for the
 * Flutter mobile app. Separate from the web app's NextAuth cookie session
 * (see src/auth.ts) since a native client can't use browser cookies.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// 10 attempts / 15 min per IP — generous enough for a real user mistyping a
// password a few times, tight enough to make bcrypt-hash brute-forcing
// impractical. Keyed by IP (not email) so an attacker can't just rotate the
// target email to dodge the limit.
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`auth-login:${getClientIp(request)}`, LOGIN_RATE_LIMIT);
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
  const { email, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), active: true, deletedAt: null },
  });
  if (!user) {
    return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  const claims = { userId: user.id, tenantId: user.tenantId, role: user.role, tokenVersion: user.tokenVersion };
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(claims),
    signRefreshToken(claims),
  ]);

  return NextResponse.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  });
}
