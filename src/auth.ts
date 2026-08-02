import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from "@/lib/locale";
import type { Locale } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Extracts and validates the NEXT_LOCALE cookie value from a raw Cookie header string. */
function parseLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`));
  if (!match) return null;
  const value = match.slice(LOCALE_COOKIE_NAME.length + 1);
  return (SUPPORTED_LOCALES as readonly string[]).includes(value) ? (value as Locale) : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Judgment call: email is unique per-tenant in the schema (a real
        // multi-tenant rollout would need a tenant selector at login), but
        // with a single demo tenant seeded we resolve login by email alone.
        const user = await prisma.user.findFirst({
          where: { email: email.toLowerCase(), active: true, deletedAt: null },
        });
        if (!user) return null;

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        // Sync the pre-login language choice (NEXT_LOCALE cookie, set by
        // the login page's language switcher — there's no User row to read
        // a saved preference from before this point) into the user's own
        // profile, so it's "saved" the way the feature requires and future
        // sessions resolve locale from User.locale first. Best-effort: a
        // missing/invalid cookie or a locale identical to what's already
        // stored is a no-op, not an error.
        const cookieLocale = parseLocaleCookie(request?.headers?.get("cookie"));
        if (cookieLocale && cookieLocale !== user.locale) {
          await prisma.user.update({
            where: { id: user.id },
            data: { locale: cookieLocale },
          });
        }

        return {
          id: user.id,
          tenantId: user.tenantId,
          role: user.role,
          email: user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role;
      return session;
    },
  },
});
