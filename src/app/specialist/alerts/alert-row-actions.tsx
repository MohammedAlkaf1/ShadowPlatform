"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { acknowledgeAlert, resolveAlert } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function AlertRowActions({ alertId, status }: { alertId: string; status: string }) {
  const router = useRouter();
  const t = useTranslations("SpecialistAlerts");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [reason, setReason] = useState("");

  async function handleAcknowledge() {
    setLoading(true);
    const result = await acknowledgeAlert(alertId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorAcknowledgeFailed"));
      return;
    }
    toast.success(t("successAcknowledged"));
    router.refresh();
  }

  async function handleResolve() {
    setLoading(true);
    const result = await resolveAlert({ alertId, reason: reason.trim() || undefined });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorResolveFailed"));
      return;
    }
    toast.success(t("successResolved"));
    setResolving(false);
    setReason("");
    router.refresh();
  }

  if (status === "resolved") {
    return <span className="text-xs text-muted-foreground">{t("closed")}</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "open" && (
          <Button size="sm" variant="outline" disabled={loading} onClick={handleAcknowledge}>
            {t("acknowledgeButton")}
          </Button>
        )}
        <Button size="sm" disabled={loading} onClick={() => setResolving((r) => !r)}>
          {t("closeAlertButton")}
        </Button>
      </div>
      {resolving && (
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("closeReasonPlaceholder")}
            rows={2}
            className="w-64"
          />
          <Button size="sm" disabled={loading} onClick={handleResolve}>
            {t("confirmCloseButton")}
          </Button>
        </div>
      )}
    </div>
  );
}
