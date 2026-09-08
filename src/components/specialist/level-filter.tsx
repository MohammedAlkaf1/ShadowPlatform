"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface LevelOption {
  value: string;
  label: string;
}

/** Real, functioning filter — options are this tenant's actual SupportLevel
 * rows, and selecting one re-filters the roster below via a real query
 * param, same pattern as CourseFilter on /faculty/students. */
export function LevelFilter({ options, allLabel }: { options: LevelOption[]; allLabel: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("level") ?? "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete("level");
    } else {
      params.set("level", value);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/specialist/queue?${qs}` : "/specialist/queue");
  }

  const label = options.find((o) => o.value === current)?.label ?? allLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-medium hover:bg-muted">
        <Filter className="size-4 text-muted-foreground" />
        <span>{label}</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px] rounded-2xl p-1.5 shadow-lg">
        <DropdownMenuItem
          onClick={() => select("")}
          className={cn("justify-between rounded-lg px-2.5 py-2", !current && "bg-muted font-bold")}
        >
          {allLabel}
          {!current && <Check className="size-4" />}
        </DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => select(option.value)}
            className={cn("justify-between rounded-lg px-2.5 py-2", current === option.value && "bg-muted font-bold")}
          >
            {option.label}
            {current === option.value && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
