"use server";

import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/session";
import { isSupportedLocale, type AppLocale } from "@/lib/locale";

/**
 * Persists a locale change directly to User.locale — resolveLocale()'s
 * highest-priority source (see src/i18n/request.ts) — for the CURRENT
 * signed-in user.
 *
 * This exists because the only locale-persistence mechanism before this
 * was the NEXT_LOCALE cookie sync in src/auth.ts's `authorize()`, which
 * only runs at the moment of signing in. A user who is already logged in
 * and flips the language switcher inside the authenticated app (see
 * AppShell) would otherwise see the cookie get set but have no effect,
 * since resolveLocale() prefers User.locale over the cookie whenever a
 * session exists — they'd have to sign out and back in for it to stick.
 * This action closes that gap directly, without requiring a fresh sign-in.
 *
 * No-ops silently (not an error) when called with no session, so the same
 * client component can safely call this unconditionally from a pre-login
 * context too (e.g. /login) — there's no User row to persist to yet, and
 * the client-set NEXT_LOCALE cookie already covers that case via
 * resolveLocale()'s priority-2 tier.
 */
export async function setLocalePreference(locale: AppLocale): Promise<void> {
  if (!isSupportedLocale(locale)) return;

  const ctx = await getRequestContext();
  if (!ctx) return;

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { locale },
  });
}
