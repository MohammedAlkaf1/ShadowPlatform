"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Filter, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { localize } from "@/lib/localize";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UniversityOption {
  value: string;
  label: string;
  labelEn?: string;
}

/**
 * Visual-only filter: this admin's queries are tenant-scoped (getTenantScopedPrisma)
 * as a security boundary, not a UI convenience, so there is no real way to
 * "switch university" from this account. Only "all" (the account's own real
 * tenant) returns real data; the other three options are presentational per
 * the design reference and intentionally resolve to an empty table rather
 * than pretending to fetch another tenant's records.
 */
export function UniversityFilter({
  options,
  allLabel,
}: {
  options: UniversityOption[];
  allLabel: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const current = searchParams.get("university") ?? "all";
  const selected = [{ value: "all", label: allLabel }, ...options].find((o) => o.value === current) ?? {
    value: "all",
    label: allLabel,
  };

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("university");
    } else {
      params.set("university", value);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/admin?${qs}` : "/admin");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-medium hover:bg-muted"
        )}
      >
        <Filter className="size-4 text-muted-foreground" />
        <span>{localize(selected.label, "labelEn" in selected ? selected.labelEn : undefined, locale)}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[240px] rounded-2xl p-1.5 shadow-lg">
        {[{ value: "all", label: allLabel }, ...options].map((option) => {
          const isSelected = option.value === current;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={() => select(option.value)}
              className={cn("justify-between rounded-lg px-2.5 py-2", isSelected && "bg-muted font-bold")}
            >
              {localize(option.label, "labelEn" in option ? option.labelEn : undefined, locale)}
              {isSelected && <Check className="size-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
