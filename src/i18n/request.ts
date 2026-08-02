import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { type AppLocale, LOCALE_COOKIE_NAME, DEFAULT_LOCALE, isSupportedLocale } from "@/lib/locale";

/**
 * next-intl WITHOUT i18n routing.
 *
 * Deliberate architecture decision: routes stay exactly as they are today
 * (/login, /student/status, /api/*, ...) — NOT restructured under an
 * app/[locale]/... prefix segment. The "with routing" setup is next-intl's
 * most common tutorial path, but adopting it here would mean moving every
 * existing route under a locale segment, which risks breaking the
 * tenant-scoping + auth + RBAC middleware (src/middleware.ts) built in
 * earlier phases — that middleware matches on exact paths like "/student",
 * "/specialist", etc. Instead, locale is resolved per-request from
 * non-URL sources only (below), and next-intl's own routing
 * middleware/navigation APIs are simply not used at all.
 *
 * Resolution priority (highest first):
 *   1. The logged-in user's saved profile preference (User.locale)
 *   2. The NEXT_LOCALE cookie (set by the language switcher; the only
 *      source available pre-login, e.g. on /login)
 *   3. The browser's Accept-Language header
 *   4. Fallback: 'ar'
 *
 * Locale constants live in src/lib/locale.ts (not here) specifically to
 * avoid a circular import: this file imports `auth` from @/auth, and
 * @/auth needs these same constants to sync the NEXT_LOCALE cookie into
 * User.locale on sign-in.
 */
export { SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE_NAME, type AppLocale } from "@/lib/locale";

export async function resolveLocale(): Promise<AppLocale> {
  // 1. Logged-in user's saved preference.
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locale: true },
      });
      if (isSupportedLocale(user?.locale)) {
        return user.locale;
      }
    }
  } catch {
    // auth() / DB unreachable — fall through to cookie/header resolution
    // rather than failing the whole request over a locale lookup.
  }

  // 2. Cookie (set by the language switcher; the only signal available
  // before a session exists, e.g. on /login).
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 3. Accept-Language header default — a simple "is English preferred
  // ahead of Arabic" heuristic (not a full q-value parser), good enough
  // since this is only the last-resort fallback tier.
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language")?.toLowerCase();
  if (acceptLanguage) {
    const enIndex = acceptLanguage.indexOf("en");
    const arIndex = acceptLanguage.indexOf("ar");
    if (enIndex !== -1 && (arIndex === -1 || enIndex < arIndex)) {
      return "en";
    }
  }

  // 4. Fallback.
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
