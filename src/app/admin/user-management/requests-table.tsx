"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Priority = "high" | "medium" | "low";
type RequestStatus = "pending" | "approved" | "rejected";

interface RequestRow {
  id: string;
  type: string;
  by: string;
  date: string;
  priority: Priority;
  status: RequestStatus;
}

const PRIORITY_BAR: Record<Priority, string> = {
  high: "bg-red-700 dark:bg-red-500",
  medium: "bg-amber-600 dark:bg-amber-500",
  low: "bg-muted-foreground/50",
};

const STATUS_BADGE: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-400",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-400",
};

/**
 * This app has no generic staff account-request model (see the page-level
 * comment) — these 4 rows are explicit UI mock data, not real records, so
 * approve/reject/review only update local component state (with a toast)
 * rather than calling a server action or navigating to a real record that
 * doesn't exist.
 */
export function RequestsTable() {
  const t = useTranslations("AdminManageUsers");
  const [rows, setRows] = useState<RequestRow[]>([
    { id: "1", type: t("mockReq1Type"), by: t("mockReq1By"), date: t("mockReq1Date"), priority: "high", status: "pending" },
    { id: "2", type: t("mockReq2Type"), by: t("mockReq2By"), date: t("mockReq2Date"), priority: "medium", status: "pending" },
    { id: "3", type: t("mockReq3Type"), by: t("mockReq3By"), date: t("mockReq3Date"), priority: "low", status: "approved" },
    { id: "4", type: t("mockReq4Type"), by: t("mockReq4By"), date: t("mockReq4Date"), priority: "medium", status: "rejected" },
  ]);
  const [reviewing, setReviewing] = useState<RequestRow | null>(null);

  function setStatus(id: string, status: RequestStatus) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(status === "approved" ? t("toastApproved") : t("toastRejected"));
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
      <div className="flex items-center gap-4 bg-muted/40 px-5 py-2.5">
        <p className="flex-[2.2] text-[11px] font-bold text-muted-foreground">{t("reqType")}</p>
        <p className="flex-[1.6] text-[11px] font-bold text-muted-foreground">{t("reqBy")}</p>
        <p className="flex-1 text-[11px] font-bold text-muted-foreground">{t("reqDate")}</p>
        <p className="flex-[0.9] text-[11px] font-bold text-muted-foreground">{t("reqPriority")}</p>
        <p className="flex-[1.2] text-[11px] font-bold text-muted-foreground">{t("reqStatus")}</p>
        <p className="flex-[2] text-end text-[11px] font-bold text-muted-foreground">{t("reqActions")}</p>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
          <p className="flex-[2.2] text-[13.5px] font-bold">{r.type}</p>
          <p className="flex-[1.6] text-[13px] text-muted-foreground">{r.by}</p>
          <p className="flex-1 text-[12.5px] text-muted-foreground">{r.date}</p>
          <div className="flex flex-[0.9] items-center gap-2">
            <span className={cn("h-3 w-[5px] shrink-0 rounded-sm", PRIORITY_BAR[r.priority])} />
            <span className="text-[12.5px] font-bold">{t(`priority_${r.priority}`)}</span>
          </div>
          <div className="flex-[1.2]">
            <span className={cn("inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold", STATUS_BADGE[r.status])}>
              {t(`reqStatus_${r.status}`)}
            </span>
          </div>
          <div className="flex flex-[2] items-center justify-end gap-2">
            {r.status === "pending" && (
              <>
                <Button size="sm" className="rounded-lg bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => setStatus(r.id, "approved")}>
                  {t("reqApprove")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-transparent bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-400"
                  onClick={() => setStatus(r.id, "rejected")}
                >
                  {t("reqReject")}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setReviewing(r)}>
              {t("reqReview")}
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={reviewing !== null} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reviewing?.type}</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="text-muted-foreground">{t("reqBy")}</span>
                <span className="font-medium">{reviewing.by}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="text-muted-foreground">{t("reqDate")}</span>
                <span className="font-medium">{reviewing.date}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                <span className="text-muted-foreground">{t("reqPriority")}</span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className={cn("h-3 w-[5px] shrink-0 rounded-sm", PRIORITY_BAR[reviewing.priority])} />
                  {t(`priority_${reviewing.priority}`)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("reqStatus")}</span>
                <span className={cn("inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold", STATUS_BADGE[reviewing.status])}>
                  {t(`reqStatus_${reviewing.status}`)}
                </span>
              </div>
            </div>
          )}
          {reviewing?.status === "pending" && (
            <DialogFooter>
              <Button
                className="rounded-xl bg-emerald-700 text-white hover:bg-emerald-800"
                onClick={() => {
                  setStatus(reviewing.id, "approved");
                  setReviewing(null);
                }}
              >
                {t("reqApprove")}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-transparent bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-400"
                onClick={() => {
                  setStatus(reviewing.id, "rejected");
                  setReviewing(null);
                }}
              >
                {t("reqReject")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
