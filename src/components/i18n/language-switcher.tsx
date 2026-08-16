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
 * authenticated app (AppShell's header, visible on every page).
 *
 * Batch 6: was a two-button segmented control (both "العربية" and
 * "English" always visible, active one highlighted) — the reference file
 * shows exactly ONE button at a time, labeled with the OTHER locale's name
 * (i.e. while the UI is in Arabic, the single visible button reads
 * "English", and vice versa); one click toggles straight to that locale.
 * Persistence logic (cookie + setLocalePreference + router.refresh) is
 * unchanged — only the rendered markup changed from 2 buttons to 1.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as AppLocale;
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nextLocale: AppLocale = locale === "ar" ? "en" : "ar";

  function handleClick() {
    if (isPending) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
    startTransition(async () => {
      await setLocalePreference(nextLocale);
      router.refresh();
    });
  }

  return (
    // min-h-11 (44px touch target) — this switcher is persistent chrome,
    // rendered on every authenticated page plus /login. variant="outline"
    // here (not accent/terracotta) — see button.tsx's variant comment.
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-h-11 rounded-full px-4", className)}
      disabled={isPending}
      onClick={handleClick}
      aria-label={t("label")}
    >
      {t(nextLocale === "en" ? "english" : "arabic")}
    </Button>
  );
}
