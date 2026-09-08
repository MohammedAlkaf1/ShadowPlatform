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

/** Real, functioning course filter — every option is one of this faculty
 * member's own courseCodes, and selecting one actually re-filters the
 * roster below (unlike the admin dashboard's university filter, which has
 * no real multi-tenant data to filter by). */
export function CourseFilter({ courseCodes, allLabel }: { courseCodes: string[]; allLabel: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("course") ?? "";

  function select(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) {
      params.delete("course");
    } else {
      params.set("course", value);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/faculty/students?${qs}` : "/faculty/students");
  }

  const label = current || allLabel;

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
        {courseCodes.map((code) => (
          <DropdownMenuItem
            key={code}
            onClick={() => select(code)}
            className={cn("justify-between rounded-lg px-2.5 py-2", current === code && "bg-muted font-bold")}
          >
            {code}
            {current === code && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
