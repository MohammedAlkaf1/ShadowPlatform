"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setUserActive } from "./actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  userId: string;
  active: boolean;
}

/**
 * Reference's row actions are two plain buttons — "تفاصيل" (details) and
 * "تعطيل"/"تنشيط" (disable/enable, tinted red/green). "تفاصيل" now
 * navigates to the user's real full-page profile (/admin/profile?userId=)
 * instead of opening a modal over the table — same destination as clicking
 * the sidebar's own profile card.
 */
export function UserRowActions({ userId, active }: Props) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const [loading, setLoading] = useState(false);

  async function handleToggleActive() {
    setLoading(true);
    const result = await setUserActive(userId, !active);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorStatusUpdateFailed"));
      return;
    }
    toast.success(active ? t("successUserDeactivated") : t("successUserActivated"));
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Link href={`/admin/profile?userId=${userId}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg")}>
        {t("detailsButton")}
      </Link>
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={handleToggleActive}
        className={
          active
            ? "rounded-lg border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20"
            : "rounded-lg border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400"
        }
      >
        {active ? t("disableButton") : t("enableButton")}
      </Button>
    </div>
  );
}
