/**
 * Picks the English rendering of a real (not app-copy) piece of data when
 * one exists and the current locale is English, falling back to the
 * Arabic value otherwise — never machine-translates or guesses. Use for
 * fields with a genuine nullable *_En counterpart in the schema (User.
 * fullNameEn, Tenant.nameEn, StudentProfile.majorEn/academicStageEn, ...).
 */
export function localize(ar: string, en: string | null | undefined, locale: string): string {
  return locale === "en" && en ? en : ar;
}
