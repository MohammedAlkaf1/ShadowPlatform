"use client";

import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut } from "lucide-react";

export function SignOutButton({ className }: { className?: string }) {
  const t = useTranslations("Nav");
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
