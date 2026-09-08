import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";

/**
 * Standalone access/refresh JWTs for the Flutter mobile app.
 *
 * These are intentionally separate from NextAuth's own session cookie
 * (which is browser-cookie based and not usable by a native mobile client).
 * Both token families carry the same userId/tenantId/role claims that
 * middleware.ts and the web session rely on, so downstream authorization
 * logic (role checks, tenant scoping) is identical for both entry points.
 *
 * Signed with HS256 using NEXTAUTH_SECRET — reusing the one app-wide secret
 * rather than introducing a second one to manage.
 */

const ACCESS_TOKEN_TTL = "1h";
const REFRESH_TOKEN_TTL = "30d";

function getSecretKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface MobileJwtClaims {
  userId: string;
  tenantId: string;
  role: UserRole;
  // The User.tokenVersion this token was minted under — compared against
  // the live DB value on every use (see api-auth.ts's getMobileRequestContext
  // and the refresh endpoint), so bumping the column instantly invalidates
  // every outstanding token for that user regardless of its own expiry.
  tokenVersion: number;
}

export async function signAccessToken(claims: MobileJwtClaims): Promise<string> {
  return new SignJWT({ ...claims, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getSecretKey());
}

export async function signRefreshToken(claims: MobileJwtClaims): Promise<string> {
  return new SignJWT({ ...claims, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .sign(getSecretKey());
}

export interface VerifiedMobileToken extends MobileJwtClaims {
  type: "access" | "refresh";
}

export async function verifyMobileToken(token: string): Promise<VerifiedMobileToken> {
  const { payload } = await jwtVerify(token, getSecretKey());
  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
    role: payload.role as UserRole,
    tokenVersion: payload.tokenVersion as number,
    type: payload.type as "access" | "refresh",
  };
}

/** Extracts a bearer token from the Authorization header, or null. */
export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}
