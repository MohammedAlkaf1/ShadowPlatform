import { DEFAULT_LOCALE, isSupportedLocale } from "./locale";

/** Maps our app locale to the Intl locale string used for date/number formatting. */
const INTL_LOCALE: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
};

/**
 * Accepts a plain string (not the narrower AppLocale type) since callers
 * typically pass next-intl's `getLocale()`/`useLocale()` result straight
 * through, and next-intl types that as `string` rather than our own
 * AppLocale union. Falls back to the default locale for anything
 * unrecognized rather than throwing.
 */
function toIntlLocale(locale: string): string {
  const resolved = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  return INTL_LOCALE[resolved];
}

export function formatDate(date: Date, locale: string): string {
  return date.toLocaleDateString(toIntlLocale(locale));
}

export function formatDateTime(date: Date, locale: string): string {
  return date.toLocaleString(toIntlLocale(locale));
}
