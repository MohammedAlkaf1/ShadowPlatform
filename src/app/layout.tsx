import type { Metadata } from "next";
import { Tajawal, IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/providers/auth-provider";

const tajawal = Tajawal({
  variable: "--font-sans",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  display: "swap",
});

// Font judgment call: Tajawal is designed and tuned for Arabic, and while
// it ships Latin glyphs, its Latin style reads as noticeably geometric/
// unusual for English UI copy. For the English locale we pair with Inter
// instead — a standard, highly legible UI sans-serif — rather than force
// Tajawal's Latin fallback everywhere. Both are loaded under the SAME
// `--font-sans` CSS variable name; RootLayout picks whichever font
// instance to apply based on the resolved locale, so the rest of the app's
// Tailwind classes (font-sans) don't need to know which locale is active.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-fallback",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Brand");
  return {
    title: t("name"),
    description: t("tagline"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";
  const sansFont = locale === "en" ? inter : tajawal;

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${sansFont.variable} ${ibmPlexSansArabic.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
