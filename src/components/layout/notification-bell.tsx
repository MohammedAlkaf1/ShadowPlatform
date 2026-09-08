"use client";

import { useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface NotificationItem {
  title: string;
  time: string;
}

/**
 * This app has no notifications backend/model, so there is no generic
 * "mark as read" or per-notification click-through — but the button itself
 * must still be a real, working control (it was previously a plain <span>
 * that never opened anything, reported as broken). `items` should always
 * be REAL, meaningful content computed by the calling page from its own
 * data (e.g. pending cases needing a specialist) — never fabricated
 * placeholder text. A page with nothing real to show just renders the
 * genuine empty state.
 */
export function NotificationBell({
  count,
  items,
  className,
}: {
  count?: number;
  items?: NotificationItem[];
  className?: string;
}) {
  const t = useTranslations("Notifications");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted",
          className
        )}
        aria-label={t("title")}
      >
        <Bell className="size-4" />
        {!!count && count > 0 && (
          <span className="absolute -top-1 -end-1 flex min-w-[17px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-[17px] text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px] rounded-2xl p-2">
        <p className="px-2 py-1.5 text-[13.5px] font-extrabold">{t("title")}</p>
        <DropdownMenuSeparator />
        {items && items.length > 0 ? (
          <div className="flex flex-col gap-1 p-1">
            {items.map((item, i) => (
              <div key={i} className="rounded-lg px-2.5 py-2 hover:bg-muted">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.time}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-2.5 py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
