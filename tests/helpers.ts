import "./setup";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-jwt";
import type { User } from "@prisma/client";

export async function getDemoUser(email: string): Promise<User> {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    throw new Error(
      `Demo user ${email} not found — run "npx prisma db seed" against the test database before running tests.`
    );
  }
  return user;
}

export async function tokenFor(email: string): Promise<{ token: string; user: User }> {
  const user = await getDemoUser(email);
  const token = await signAccessToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  return { token, user };
}

export function authedRequest(url: string, token: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(url, { ...init, headers });
}
