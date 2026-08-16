"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // ROOT CAUSE of the reported column-misalignment bug: this used to
        // be hardcoded `text-left`, which never adapts to dir="rtl" — every
        // header stayed left-aligned while TableCell (below) had no forced
        // alignment and followed the browser's direction-aware default,
        // putting header text and body text on opposite sides of the
        // column in RTL. `text-start` is the logical-property equivalent —
        // it resolves to "left" in LTR and "right" in RTL, matching
        // whichever direction TableCell also now explicitly uses.
        // py-[14px] px-5: matches the reference file's table header cell
        // padding (14px 20px) — was h-10/px-2 (a much denser, pre-fidelity-
        // pass approximation).
        "py-[14px] px-5 text-start align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // Explicit `text-start` (not left implicit/inherited) so this
        // always matches TableHead's alignment strategy exactly, in both
        // directions — see the note on TableHead above.
        //
        // PITFALL (this was a real, shipped regression — see the RTL
        // email-column-alignment fix): do NOT put `dir="ltr"` directly on
        // a <TableCell> that also carries (or inherits) a `text-start`/
        // `text-end` class. `text-align: start/end` resolves against the
        // element's OWN computed direction, not the page's — so a cell
        // with `dir="ltr"` always aligns relative to LTR regardless of
        // whether the page is actually RTL, which desyncs it from
        // TableHead (whose alignment always follows the real page
        // direction, since it's never given its own forced `dir`). This
        // happens to be invisible for content that genuinely should
        // always sit on the same physical side in both languages (dates,
        // technical/monospace codes — `text-start` + `dir="ltr"` on those
        // is intentional and correct, see admin/audit-log/page.tsx's date
        // column), but for anything that should track the page's actual
        // reading direction (emails, names, any natural-language-adjacent
        // identifier), it silently breaks alignment against the header in
        // one of the two languages.
        //
        // Safe pattern for LTR-only content (emails, etc.) that must still
        // sit correctly under an RTL-or-LTR header: leave THIS cell with
        // no `dir`/alignment override at all (so it follows the page,
        // matching the header), and put `dir="ltr"` only on an inner
        // wrapping element around just that text, e.g.
        // `<TableCell><span dir="ltr">{email}</span></TableCell>`. See
        // admin/users/page.tsx's user table for a real example.
        // py-[15px] px-5: matches the reference file's table row cell
        // padding (15px 20px) — was p-2.
        "py-[15px] px-5 align-middle text-start whitespace-nowrap [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
