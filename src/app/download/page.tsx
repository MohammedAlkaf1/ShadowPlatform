import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { BrandWordmark } from "@/components/layout/brand-mark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

/**
 * Public Android APK download page — https://shadowtutor.org/download
 *
 * Intentionally NOT under AppShell: this route has no session (listed in
 * middleware.ts's PUBLIC_PATHS) and must render for anonymous visitors,
 * e.g. a hackathon judge scanning a QR code straight to this URL.
 *
 * The APK itself is a static asset at /downloads/Shadow-Android.apk (public/
 * downloads/), served directly by Next.js — same mechanism as every other
 * file under public/. It is the exact production-signed release APK, just
 * renamed for a friendlier download filename; contents are untouched.
 */

const APK_PATH = "/downloads/Shadow-Android.apk";
const APK_SIZE_MB = "59";
const APP_VERSION = "1.0.0";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const isArabic = locale === "ar";
  return {
    title: isArabic ? "تنزيل تطبيق شادو — أندرويد" : "Download Shadow — Android App",
    description: isArabic
      ? "نزّل تطبيق شادو لنظام أندرويد، دعم تعلّم ذكي وميسّر لذوي الإعاقة."
      : "Download the Shadow mobile application for Android and experience accessible learning support designed for students with disabilities.",
  };
}

export default async function DownloadPage() {
  const locale = await getLocale();
  const isArabic = locale === "ar";

  const t = {
    home: isArabic ? "الصفحة الرئيسية لشادو" : "Shadow home",
    tagline: isArabic ? "دعم تعلّم ذكي وميسّر" : "Accessible AI-powered learning support",
    appLabel: isArabic ? "تطبيق أندرويد" : "Android Mobile Application",
    description: isArabic
      ? "نزّل تطبيق شادو لنظام أندرويد، واستمتع بدعم تعلّم ميسّر مصمم للطلاب ذوي الإعاقة."
      : "Download the Shadow mobile application for Android and experience accessible learning support designed for students with disabilities.",
    downloadButton: isArabic ? "تنزيل تطبيق أندرويد" : "Download Android App",
    note: isArabic ? "ملف APK لأندرويد • إصدار إنتاجي" : "Android APK • Production Release",
    version: isArabic ? "الإصدار" : "Version",
    size: isArabic ? "الحجم" : "Size",
    iosNotice: isArabic
      ? "هذا التنزيل مخصص لأجهزة أندرويد فقط، ولا يعمل على آيفون أو آيباد."
      : "This is an Android APK — for Android devices. It will not install on iPhone or iPad.",
    installNote: isArabic
      ? "بعد التنزيل، افتح الملف على جهاز أندرويد لتثبيته. قد تحتاج للسماح بالتثبيت من مصادر غير معروفة."
      : "After downloading, open the file on an Android device to install it. You may need to allow installs from unknown sources.",
    back: isArabic ? "العودة إلى شادو" : "Back to Shadow",
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f2eb] dark:bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-6 sm:px-6">
        <Link
          href="/"
          aria-label={t.home}
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <BrandWordmark alt={isArabic ? "شادو" : "Shadow"} markClassName="h-8" />
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-xl sm:px-14 sm:py-14">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            {/* Android/mobile glyph */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>

          <p className="mt-6 text-sm font-semibold tracking-wide text-muted-foreground">{t.tagline}</p>
          <h1 className="mt-2 text-2xl font-extrabold text-foreground sm:text-3xl">{t.appLabel}</h1>

          <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-muted-foreground">
            {t.description}
          </p>

          <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span>
              {t.version}: <span className="font-semibold text-foreground">{APP_VERSION}</span>
            </span>
            <span aria-hidden="true">•</span>
            <span>
              {t.size}: <span className="font-semibold text-foreground">~{APK_SIZE_MB} MB</span>
            </span>
          </div>

          <a
            href={APK_PATH}
            download="Shadow-Android.apk"
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 text-base font-bold text-accent-foreground shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-auto"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t.downloadButton}
          </a>

          <p className="mt-3 text-xs font-medium text-muted-foreground">{t.note}</p>

          <div className="mt-8 space-y-2 border-t border-border pt-6 text-xs leading-6 text-muted-foreground">
            <p>{t.iosNotice}</p>
            <p>{t.installNote}</p>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-4 pb-10 text-center sm:px-6">
        <Link
          href="/"
          className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {t.back}
        </Link>
      </footer>
    </div>
  );
}
