import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signAccessToken, verifyMobileToken } from "@/lib/mobile-jwt";

const bodySchema = z.object({
  refreshToken: z.string().min(1),
});

/** POST /api/auth/refresh — exchanges a valid refresh token for a new access token. */
export async function POST(request: Request) {
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

    const accessToken = await signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
    return NextResponse.json({ accessToken });
  } catch {
    return NextResponse.json({ error: "رمز التحديث غير صالح أو منتهي" }, { status: 401 });
  }
}
