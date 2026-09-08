"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function SignOutButton({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  const t = useTranslations("Nav");

  if (iconOnly) {
    return (
      <Button
        variant="outline"
        size="icon-lg"
        className={cn("rounded-xl bg-background text-muted-foreground", className)}
        onClick={() => signOut({ callbackUrl: "/login" })}
        aria-label={t("signOut")}
      >
        {/* Points outward (away from the app): the icon's default arrow
            faces right, which is already correct in LTR (this button sits
            at the far RIGHT there); flip it only in RTL, where this same
            DOM position puts the button at the far LEFT instead. */}
        <LogOut className="size-4 rtl:-scale-x-100" />
      </Button>
    );
  }

  return (
    // Batch 5: moved from the sidebar's bottom section into the header
    // (see app-shell.tsx) — the reference file's header shows it as a
    // bordered, muted-text pill (min-height:44px, border, no fill), not
    // the sidebar-styled ghost button it used to be.
    <Button
      variant="outline"
      size="sm"
      className={cn("min-h-11 gap-2 rounded-[14px] px-4 text-muted-foreground", className)}
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4" />
      {t("signOut")}
    </Button>
  );
}
