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
      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut className="size-4 ms-2" />
      {t("signOut")}
    </Button>
  );
}
