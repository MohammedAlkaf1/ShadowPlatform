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

/**
 * "اليوم ١٢:٤٥" / "أمس ١٧:٣٠" style relative-day label — matches the
 * reference audit log's time column exactly. Falls back to a plain date
 * (no time) once it's more than a day old, since "3 days ago" style aging
 * isn't part of the reference's own format for older rows.
 */
export function formatRelativeDay(date: Date, locale: string, todayLabel: string, yesterdayLabel: string): string {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  const time = date.toLocaleTimeString(toIntlLocale(locale), { hour: "2-digit", minute: "2-digit" });
  if (dayDiff === 0) return `${todayLabel} ${time}`;
  if (dayDiff === 1) return `${yesterdayLabel} ${time}`;
  // Reference: "الأحد ١١:٢٠" — a weekday name (not a full date) for
  // anything within the last week, falling back to a plain date beyond
  // that (matches formatRelativeDay's own "more than a day old" cutoff
  // philosophy, just extended to a week instead of a day).
  if (dayDiff > 1 && dayDiff < 7) {
    const weekday = date.toLocaleDateString(toIntlLocale(locale), { weekday: "long" });
    return `${weekday} ${time}`;
  }
  return formatDate(date, locale);
}
