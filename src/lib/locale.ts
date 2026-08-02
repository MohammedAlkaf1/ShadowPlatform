/**
 * Locale constants shared between src/i18n/request.ts (locale resolution)
 * and src/auth.ts (syncing the pre-login cookie into User.locale on
 * sign-in). Kept in their own module, with no dependency on either of
 * those two files, specifically to avoid a circular import between them.
 */
export const SUPPORTED_LOCALES = ["ar", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "ar";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
