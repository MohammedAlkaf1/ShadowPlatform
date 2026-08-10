"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE_NAME, type AppLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { setLocalePreference } from "./actions";

/**
 * Shared switcher used both pre-login (/login) and inside the
 * authenticated app (AppShell's sidebar, visible on every page).
 *
 * Two persistence paths run on every switch, since this component doesn't
 * know whether a session exists:
 *   1. The NEXT_LOCALE cookie is always set client-side — the only signal
 *      available pre-login (no User row to save a preference to yet), and
 *      it's what src/auth.ts syncs into User.locale on the NEXT sign-in.
 *   2. setLocalePreference() (a server action) is always called too — for
 *      an already-authenticated user it writes User.locale directly, so
 *      the change sticks immediately without requiring a fresh sign-in.
 *      It's a silent no-op with no session (e.g. on /login), so it's safe
 *      to call unconditionally here rather than needing this component to
 *      know its own context.
 * router.refresh() then re-runs the server render, and resolveLocale()
 * (src/i18n/request.ts) picks up whichever of the two just changed.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: AppLocale) {
    if (next === locale || isPending) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(async () => {
      await setLocalePreference(next);
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
