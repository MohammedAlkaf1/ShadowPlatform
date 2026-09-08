"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { saveSupportPlan, approveSupportPlan, reviseSupportLevel, returnRequestToStudent, updatePlanItemConfig } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Pencil } from "lucide-react";
import { TOOL_CODES, TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";

interface PlanItemConfig {
  courses?: string;
  startDate?: string;
  visible?: string;
}

interface SupportLevelOption {
  id: string;
  name: string;
  order: number;
}
interface PlanInfo {
  id: string;
  status: "draft" | "approved" | "expired";
  initialEnabledCodes: ToolCodeValue[];
  initialConfigs: Record<string, PlanItemConfig>;
}

/**
 * "خطة الدعم" tab: each enabled ToolActivation renders as a real card
 * (name + real enable state), addable/removable via "+ إضافة بند" and a
 * per-card remove control. The per-card "target courses / start date /
 * visibility" fields are real, editable data — stored in
 * ToolActivation.config (the JSON field built for exactly this) via the
 * pencil-edit button, not fabricated display text.
 */
export function PlanTab({
  studentProfileId,
  supportLevels,
  latestAssessmentId,
  plan,
}: {
  studentProfileId: string;
  supportLevels: SupportLevelOption[];
  latestAssessmentId: string | null;
  plan: PlanInfo | null;
}) {
  const router = useRouter();
  const t = useTranslations("SpecialistReview");
  const locale = useLocale();

  const [selected, setSelected] = useState<Set<ToolCodeValue>>(new Set(plan?.initialEnabledCodes ?? []));
  const [configs, setConfigs] = useState<Record<string, PlanItemConfig>>(plan?.initialConfigs ?? {});
  const [editingCode, setEditingCode] = useState<ToolCodeValue | null>(null);
  const [editDraft, setEditDraft] = useState<PlanItemConfig>({});
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [newLevelId, setNewLevelId] = useState("");
  const [reviseReason, setReviseReason] = useState("");

  const isApproved = plan?.status === "approved";
  const availableToAdd = TOOL_CODES.filter((c) => !selected.has(c));

  async function persist(next: Set<ToolCodeValue>) {
    if (!latestAssessmentId) return;
    setLoading(true);
    const result = await saveSupportPlan({
      studentProfileId,
      assessmentId: latestAssessmentId,
      enabledToolCodes: Array.from(next),
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    setSelected(next);
    router.refresh();
  }

  function addItem(code: ToolCodeValue) {
    setAdding(false);
    void persist(new Set(selected).add(code));
  }

  function removeItem(code: ToolCodeValue) {
    const next = new Set(selected);
    next.delete(code);
    void persist(next);
  }

  function openEdit(code: ToolCodeValue) {
    setEditingCode(code);
    setEditDraft(configs[code] ?? {});
  }

  async function saveEdit() {
    if (!plan || !editingCode) return;
    setLoading(true);
    const result = await updatePlanItemConfig({
      planId: plan.id,
      toolCode: editingCode,
      studentProfileId,
      courses: editDraft.courses,
      startDate: editDraft.startDate,
      visible: editDraft.visible,
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    setConfigs((prev) => ({ ...prev, [editingCode]: editDraft }));
    setEditingCode(null);
    router.refresh();
  }

  async function handleApprove() {
    if (!plan) return;
    setLoading(true);
    const result = await approveSupportPlan(plan.id, studentProfileId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorApproveFailed"));
      return;
    }
    toast.success(t("successApproved"));
    router.refresh();
  }

  async function handleReturnToStudent() {
    setLoading(true);
    const result = await returnRequestToStudent(studentProfileId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    toast.success(t("successReturned"));
    router.refresh();
  }

  async function handleRevise() {
    if (!plan || !newLevelId) {
      toast.error(t("errorSelectNewLevel"));
      return;
    }
    if (reviseReason.trim().length < 5) {
      toast.error(t("errorReasonTooShort"));
      return;
    }
    setLoading(true);
    const result = await reviseSupportLevel({
      studentProfileId,
      supportPlanId: plan.id,
      newSupportLevelId: newLevelId,
      reason: reviseReason,
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorReviseFailed"));
      return;
    }
    toast.success(t("successRevised"));
    setRevising(false);
    setReviseReason("");
    router.refresh();
  }

  if (!latestAssessmentId) {
    return (
      <p className="rounded-[18px] border border-border bg-card py-10 text-center text-sm text-muted-foreground">
        {t("cannotCreateYet")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!isApproved && (
          <div className="relative">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding((a) => !a)} disabled={loading}>
              <Plus className="size-3.5" data-icon="inline-start" />
              {t("addItemButton")}
            </Button>
            {adding && (
              <div className="absolute end-0 z-10 mt-1.5 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-lg">
                {availableToAdd.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("allItemsAdded")}</p>
                ) : (
                  availableToAdd.map((code) => {
                    const meta = TOOL_CODE_LABELS[code];
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => addItem(code)}
                        className="block w-full rounded-lg px-2.5 py-2 text-start text-sm hover:bg-muted"
                      >
                        {locale === "en" ? meta.en : meta.ar}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isApproved && (
        <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">{t("toolsLockedNotice")}</p>
      )}

      {selected.size === 0 ? (
        <p className="rounded-[18px] border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
          {t("noPlanItemsYet")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(selected).map((code) => {
            const meta = TOOL_CODE_LABELS[code];
            return (
              <div key={code} className="rounded-[18px] border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3.5">
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-extrabold text-foreground">
                      {locale === "en" ? meta.en : meta.ar}
                    </p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {locale === "en" ? meta.descriptionEn : meta.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="rounded-lg bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-400">
                      {t("proposedBadge")}
                    </Badge>
                    {!isApproved && (
                      <button
                        type="button"
                        title={t("editItemButton")}
                        onClick={() => openEdit(code)}
                        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    {!isApproved && (
                      <button
                        type="button"
                        title={t("removeItemButton")}
                        onClick={() => removeItem(code)}
                        className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {editingCode === code ? (
                  <div className="mt-4 space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("planCoursesLabel")}</Label>
                        <Input
                          value={editDraft.courses ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, courses: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("planStartLabel")}</Label>
                        <Input
                          type="date"
                          value={editDraft.startDate ?? ""}
                          onChange={(e) => setEditDraft((d) => ({ ...d, startDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("planVisibleLabel")}</Label>
                        <Select value={editDraft.visible ?? ""} onValueChange={(v) => setEditDraft((d) => ({ ...d, visible: v ?? "" }))}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("planVisibleLabel")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="student">{t("visibleToStudent")}</SelectItem>
                            <SelectItem value="specialist">{t("visibleToSpecialistOnly")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={saveEdit} disabled={loading}>
                        {t("saveItemButton")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingCode(null)}>
                        {t("cancelReclassify")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] font-semibold text-muted-foreground">{t("planCoursesLabel")}</span>
                      <span className="text-[13.5px] font-bold text-foreground">{configs[code]?.courses || "—"}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] font-semibold text-muted-foreground">{t("planStartLabel")}</span>
                      <span className="text-[13.5px] font-bold text-foreground">{configs[code]?.startDate || "—"}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11.5px] font-semibold text-muted-foreground">{t("planVisibleLabel")}</span>
                      <span className="text-[13.5px] font-bold text-foreground">
                        {configs[code]?.visible === "student"
                          ? t("visibleToStudent")
                          : configs[code]?.visible === "specialist"
                            ? t("visibleToSpecialistOnly")
                            : "—"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* The one accent action on this tab — only real once a draft plan
            actually exists to approve (approveSupportPlan needs a plan.id). */}
        {!isApproved && plan && (
          <Button type="button" variant="accent" onClick={handleApprove} disabled={loading}>
            {t("submitForApprovalButton")}
          </Button>
        )}
        {!isApproved && (
          <Button
            type="button"
            variant={plan ? "secondary" : "accent"}
            onClick={() => persist(selected)}
            disabled={loading || selected.size === 0}
          >
            {t("saveDraftButton")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={handleReturnToStudent} disabled={loading}>
          {t("sendBackButton")}
        </Button>
      </div>

      {isApproved && (
        <div className="space-y-3 rounded-[16px] border border-border bg-secondary/40 p-4">
          <Button type="button" variant="outline" onClick={() => setRevising((r) => !r)}>
            {t("reviseButton")}
          </Button>
          {revising && (
            <div className="space-y-3">
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
                <Textarea value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} rows={3} required minLength={5} />
              </div>
              <Button type="button" onClick={handleRevise} disabled={loading}>
                {t("saveRevisionButton")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
