"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { saveSupportPlan, approveSupportPlan, reviseSupportLevel } from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TOOL_CODES, TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";

interface SupportLevelOption {
  id: string;
  name: string;
  order: number;
}

export function PlanForm({
  studentProfileId,
  assessmentId,
  planId,
  planStatus,
  initialEnabledCodes,
  supportLevels,
}: {
  studentProfileId: string;
  assessmentId: string;
  planId: string | null;
  planStatus: "draft" | "approved" | "expired" | null;
  initialEnabledCodes: ToolCodeValue[];
  supportLevels: SupportLevelOption[];
}) {
  const router = useRouter();
  const t = useTranslations("SpecialistPlan");
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<ToolCodeValue>>(new Set(initialEnabledCodes));
  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [newLevelId, setNewLevelId] = useState("");
  const [reason, setReason] = useState("");

  const isApproved = planStatus === "approved";

  function toggle(code: ToolCodeValue) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSave() {
    setLoading(true);
    const result = await saveSupportPlan({
      studentProfileId,
      assessmentId,
      enabledToolCodes: Array.from(selected),
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    toast.success(t("successSaved"));
    router.refresh();
  }

  async function handleApprove() {
    if (!planId) return;
    setLoading(true);
    const result = await approveSupportPlan(planId, studentProfileId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorApproveFailed"));
      return;
    }
    toast.success(t("successApproved"));
    router.refresh();
  }

  async function handleRevise() {
    if (!planId || !newLevelId) {
      toast.error(t("errorSelectNewLevel"));
      return;
    }
    // The server requires reason.length >= 5 (reviseLevelSchema in
    // actions.ts) and rejects anything shorter with a generic "invalid
    // data" error. Nothing here was enforcing that before submit, so an
    // empty/short reason silently reached the server and came back as an
    // unexplained failure. Checked client-side first for a clear message.
    if (reason.trim().length < 5) {
      toast.error(t("errorReasonTooShort"));
      return;
    }
    setLoading(true);
    const result = await reviseSupportLevel({
      studentProfileId,
      supportPlanId: planId,
      newSupportLevelId: newLevelId,
      reason,
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorReviseFailed"));
      return;
    }
    toast.success(t("successRevised"));
    setRevising(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {isApproved && (
        <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">{t("toolsLockedNotice")}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {TOOL_CODES.map((code) => {
          const meta = TOOL_CODE_LABELS[code];
          return (
            <label
              key={code}
              className="flex items-start gap-3 rounded-md border border-border p-3 has-[[data-state=checked]]:border-accent"
            >
              <Checkbox
                checked={selected.has(code)}
                disabled={isApproved}
                onCheckedChange={() => toggle(code)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {locale === "en" ? meta.en : meta.ar}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {locale === "en" ? meta.descriptionEn : meta.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {!isApproved && (
          <Button variant="outline" onClick={handleSave} disabled={loading}>
            {t("saveToolsButton")}
          </Button>
        )}
        {!isApproved && planId && (
          <Button onClick={handleApprove} disabled={loading}>
            {t("approveButton")}
          </Button>
        )}
        {isApproved && (
          <Button variant="outline" onClick={() => setRevising((r) => !r)}>
            {t("reviseButton")}
          </Button>
        )}
      </div>

      {revising && (
        <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-4">
          <div className="space-y-2">
            <Label>{t("newLevelLabel")}</Label>
            <Select value={newLevelId} onValueChange={(v) => setNewLevelId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder={t("newLevelPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {supportLevels
                  .sort((a, b) => a.order - b.order)
                  .map((lvl) => (
                    <SelectItem key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("revisionReasonLabel")}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={5}
            />
          </div>
          <Button onClick={handleRevise} disabled={loading}>
            {t("saveRevisionButton")}
          </Button>
        </div>
      )}
    </div>
  );
}
