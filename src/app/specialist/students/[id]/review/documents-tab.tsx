import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format-date";
import { FileText, ChevronLeft, ChevronRight } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";

interface DocRow {
  id: string;
  originalFilename: string;
  createdAt: Date;
  status: DocumentStatus;
}

const STATUS_TONE: Record<DocumentStatus, string> = {
  reviewed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  pending: "bg-muted text-muted-foreground",
  needs_update: "bg-accent/15 text-accent",
};

interface DocsPagination {
  prevHref: string | null;
  nextHref: string | null;
  showingLabel: string;
}

export function DocumentsTab({
  documents,
  locale,
  labels,
  pagination,
}: {
  documents: DocRow[];
  locale: string;
  labels: {
    tableName: string;
    tableDate: string;
    tableStatus: string;
    tableAction: string;
    reviewed: string;
    pending: string;
    needsUpdate: string;
    viewButton: string;
    noDocuments: string;
  };
  pagination?: DocsPagination | null;
}) {
  if (documents.length === 0) {
    return <p className="rounded-[18px] border border-border bg-card py-10 text-center text-sm text-muted-foreground">{labels.noDocuments}</p>;
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>{labels.tableName}</TableHead>
              <TableHead>{labels.tableDate}</TableHead>
              <TableHead>{labels.tableStatus}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="flex items-center gap-2 font-medium">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  {doc.originalFilename}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span dir="ltr">{formatDate(doc.createdAt, locale)}</span>
                </TableCell>
                <TableCell>
                  <span className={cn("inline-flex rounded-lg px-2.5 py-1 text-xs font-bold", STATUS_TONE[doc.status])}>
                    {doc.status === "reviewed" ? labels.reviewed : doc.status === "needs_update" ? labels.needsUpdate : labels.pending}
                  </span>
                </TableCell>
                <TableCell>
                  <a
                    href={`/api/documents/${doc.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(buttonVariants({ size: "sm", variant: "outline" }), "rounded-lg")}
                  >
                    {labels.viewButton}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">{pagination.showingLabel}</p>
          <div className="flex items-center gap-2">
            <Link
              href={pagination.nextHref ?? "#"}
              aria-disabled={!pagination.nextHref}
              className={cn(
                buttonVariants({ variant: "secondary", size: "icon" }),
                "rounded-full",
                !pagination.nextHref && "pointer-events-none opacity-50"
              )}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={pagination.prevHref ?? "#"}
              aria-disabled={!pagination.prevHref}
              className={cn(
                buttonVariants({ variant: "secondary", size: "icon" }),
                "rounded-full",
                !pagination.prevHref && "pointer-events-none opacity-50"
              )}
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
