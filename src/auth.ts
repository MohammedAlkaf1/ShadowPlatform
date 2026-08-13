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

        // Fetched once here, at login, and carried in the JWT/session from
        // then on (see the jwt/session callbacks below) specifically so
        // requireRolePage (src/lib/require-role-page.ts, run at the top of
        // every role's layout.tsx — i.e. on EVERY authenticated page
        // navigation) doesn't need its own user.findUnique/tenant.findUnique
        // round trip just to display the email/tenant name in the sidebar.
        // That was two avoidable DB queries on every single navigation;
        // this way it's one extra query, paid once per login instead.
        const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } });

        return {
          id: user.id,
          tenantId: user.tenantId,
          role: user.role,
          email: user.email,
          tenantName: tenant?.name ?? "",
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
        token.email = user.email;
        token.tenantName = user.tenantName;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role;
      session.user.email = token.email ?? "";
      session.user.tenantName = token.tenantName;
      return session;
    },
  },
});
