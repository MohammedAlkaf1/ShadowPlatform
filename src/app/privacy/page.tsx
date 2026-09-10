import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { BrandWordmark } from "@/components/layout/brand-mark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { PRIVACY_POLICY_EN, PRIVACY_POLICY_AR } from "./policy-content";
import { PolicyBody } from "./policy-body";

/**
 * Public Privacy Policy page — https://shadowtutor.org/privacy
 *
 * Intentionally NOT under AppShell: this route has no session (it's listed
 * in middleware.ts's PUBLIC_PATHS) and must render for anonymous visitors,
 * e.g. Google Play's Privacy Policy URL reviewer. Locale is resolved the
 * same way as every other page (src/i18n/request.ts: cookie → Accept-
 * Language → default) — there is no separate /privacy URL per locale, and
 * RootLayout already sets `dir`/fonts from that same resolved locale, so
 * RTL/LTR and font selection here are automatic, not re-implemented.
 *
 * Fully static from a data perspective: no database query, no API call,
 * no auth check beyond the shared middleware allow-list.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isArabic = locale === "ar";
  return {
    title: isArabic ? "سياسة الخصوصية — شادو" : "Privacy Policy — Shadow",
    description: isArabic
      ? "سياسة خصوصية تطبيق شادو ومنصته المرتبطة، وما تجمعه ومعالجته فعليًا."
      : "The Privacy Policy for the Shadow app and its companion platform — what is actually collected and processed.",
  };
}

export default async function PrivacyPolicyPage() {
  const locale = await getLocale();
  const isArabic = locale === "ar";
  const policyText = isArabic ? PRIVACY_POLICY_AR : PRIVACY_POLICY_EN;
  const brandAlt = isArabic ? "شادو" : "Shadow";
  const homeLabel = isArabic ? "الصفحة الرئيسية لشادو" : "Shadow home";
  const backLabel = isArabic ? "العودة إلى شادو" : "Back to Shadow";

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f2eb] dark:bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-6 sm:px-6">
        <Link href="/" aria-label={homeLabel} className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <BrandWordmark alt={brandAlt} markClassName="h-8" />
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-border bg-card px-5 py-8 shadow-xl sm:px-10 sm:py-10">
          <PolicyBody text={policyText} />
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-10 text-center sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {backLabel}
        </Link>
      </footer>
    </div>
  );
}
