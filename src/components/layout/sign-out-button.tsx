"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const t = useTranslations("Nav");
  return (
    <Button
      variant="ghost"
      size="sm"
      // min-h-11 (44px touch target) on top of size="sm"'s h-7 — min-height
      // wins over the smaller explicit height, so this is persistent chrome
      // (visible on every authenticated page, same as the nav rows) staying
      // compliant without needing a whole new button size.
      className="min-h-11 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4 ms-2" />
      {t("signOut")}
    </Button>
  );
}
