import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, signRefreshToken } from "@/lib/mobile-jwt";

/**
 * POST /api/auth/login — issues an access + refresh JWT pair for the
 * Flutter mobile app. Separate from the web app's NextAuth cookie session
 * (see src/auth.ts) since a native client can't use browser cookies.
 */
const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
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

  const claims = { userId: user.id, tenantId: user.tenantId, role: user.role };
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
