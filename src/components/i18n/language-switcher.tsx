"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE_NAME, type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * Sets the NEXT_LOCALE cookie client-side and refreshes the current route
 * so the server re-resolves locale (src/i18n/request.ts) on next render.
 * This is the ONLY mechanism available pre-login (e.g. on /login) — there's
 * no User row yet to save a preference to. Once authenticated, the same
 * cookie also gets synced into User.locale on the next sign-in (see
 * src/auth.ts) so the choice is genuinely "saved to their profile" as
 * required, not just a cookie forever.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: AppLocale) {
    if (next === locale || isPending) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-background p-1", className)}
      role="group"
      aria-label={t("label")}
    >
      <Button
        type="button"
        size="sm"
        variant={locale === "ar" ? "default" : "ghost"}
        className="rounded-full px-3"
        disabled={isPending}
        onClick={() => switchTo("ar")}
      >
        {t("arabic")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={locale === "en" ? "default" : "ghost"}
        className="rounded-full px-3"
        disabled={isPending}
        onClick={() => switchTo("en")}
      >
        {t("english")}
      </Button>
    </div>
  );
}
