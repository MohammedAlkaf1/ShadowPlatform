import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMobileRole } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/auth/logout — "sign out everywhere" for the Flutter mobile app.
 * Bumps User.tokenVersion, which immediately invalidates every access AND
 * refresh JWT issued to this user before this call (see mobile-jwt.ts's
 * MobileJwtClaims.tokenVersion doc comment) — the calling device's own
 * tokens included, so the client should discard its locally-stored tokens
 * after a successful call rather than expecting them to keep working.
 * Requires a currently-valid access token (same auth as any other mobile
 * route) — an already-expired/invalid token has nothing meaningful to
 * revoke and the client can just discard it locally.
 */
export async function POST(request: Request) {
  const auth = await requireMobileRole(request);
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { tokenVersion: { increment: 1 } },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "logout_all_devices",
    resourceType: "User",
    resourceId: ctx.userId,
  });

  return NextResponse.json({ ok: true });
}
