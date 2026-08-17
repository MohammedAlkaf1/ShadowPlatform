"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  createAssessment,
  saveSupportPlan,
  approveSupportPlan,
  reviseSupportLevel,
  returnRequestToStudent,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TOOL_CODES, TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";

interface ConditionOption {
  id: string;
  name: string;
}
interface CategoryOption {
  id: string;
  name: string;
  conditions: ConditionOption[];
}
interface SupportLevelOption {
  id: string;
  name: string;
  order: number;
}
interface LatestAssessment {
  id: string;
  categoryName: string;
  conditionName: string;
  supportLevelName: string;
  notes: string;
}
interface PlanInfo {
  id: string;
  status: "draft" | "approved" | "expired";
  initialEnabledCodes: ToolCodeValue[];
}

/**
 * The mockup's "مراجعة وثيقة" screen presents classification and plan
 * approval as ONE continuous card — this combined form is the real
 * implementation of that. Two real, separate writes still happen
 * (Assessment then SupportPlan — see actions.ts), the UI just never
 * navigates away between them: creating a classification immediately
 * reveals the plan section in place via router.refresh(), matching the
 * mock's "canClassify" single-screen state model as closely as the real
 * (multi-assessment-over-time) data model allows.
 */
export function ReviewForm({
  studentProfileId,
  categories,
  supportLevels,
  latestAssessment,
  plan,
}: {
  studentProfileId: string;
  categories: CategoryOption[];
  supportLevels: SupportLevelOption[];
  latestAssessment: LatestAssessment | null;
  plan: PlanInfo | null;
}) {
  const router = useRouter();
  const t = useTranslations("SpecialistReview");
  const tPlanStatus = useTranslations("Common.planStatus");
  const locale = useLocale();

  const [reclassifying, setReclassifying] = useState(latestAssessment === null);
  const [categoryId, setCategoryId] = useState("");
  const [conditionId, setConditionId] = useState("");
  const [supportLevelId, setSupportLevelId] = useState("");
  const [notes, setNotes] = useState("");
  const [classifyLoading, setClassifyLoading] = useState(false);

  const [selected, setSelected] = useState<Set<ToolCodeValue>>(new Set(plan?.initialEnabledCodes ?? []));
  const [planLoading, setPlanLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [newLevelId, setNewLevelId] = useState("");
  const [reviseReason, setReviseReason] = useState("");

  const conditions = useMemo(
    () => categories.find((c) => c.id === categoryId)?.conditions ?? [],
    [categories, categoryId]
  );

  const isApproved = plan?.status === "approved";

  async function handleClassifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!conditionId || !supportLevelId) {
      toast.error(t("errorMissingFields"));
      return;
    }
    setClassifyLoading(true);
    const result = await createAssessment({ studentProfileId, conditionId, supportLevelId, notes });
    setClassifyLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    toast.success(t("successClassified"));
    setReclassifying(false);
    router.refresh();
  }

  function toggleTool(code: ToolCodeValue) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSaveTools() {
    if (!latestAssessment) return;
    setPlanLoading(true);
    const result = await saveSupportPlan({
      studentProfileId,
      assessmentId: latestAssessment.id,
      enabledToolCodes: Array.from(selected),
    });
    setPlanLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    toast.success(t("successSaved"));
    router.refresh();
  }

  async function handleApprove() {
    if (!plan) return;
    setPlanLoading(true);
    const result = await approveSupportPlan(plan.id, studentProfileId);
    setPlanLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorApproveFailed"));
      return;
    }
    toast.success(t("successApproved"));
    router.refresh();
  }

  async function handleReturnToStudent() {
    setPlanLoading(true);
    const result = await returnRequestToStudent(studentProfileId);
    setPlanLoading(false);
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
    setPlanLoading(true);
    const result = await reviseSupportLevel({
      studentProfileId,
      supportPlanId: plan.id,
      newSupportLevelId: newLevelId,
      reason: reviseReason,
    });
    setPlanLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorReviseFailed"));
      return;
    }
    toast.success(t("successRevised"));
    setRevising(false);
    setReviseReason("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Classification section */}
      {latestAssessment && !reclassifying ? (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {latestAssessment.categoryName} — {latestAssessment.conditionName}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("supportLevelLabel")}: {latestAssessment.supportLevelName}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setReclassifying(true)}>
              {t("reclassifyButton")}
            </Button>
          </div>
          <p className="text-sm text-foreground">{latestAssessment.notes}</p>
        </div>
      ) : (
        <form onSubmit={handleClassifySubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("categoryLabel")}</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v ?? "");
                  setConditionId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("categoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("conditionLabel")}</Label>
              <Select value={conditionId} onValueChange={(v) => setConditionId(v ?? "")} disabled={!categoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("conditionPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {conditions.map((cond) => (
                    <SelectItem key={cond.id} value={cond.id}>
                      {cond.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("supportLevelLabel")}</Label>
              <div className="flex flex-col gap-2">
                {supportLevels
                  .sort((a, b) => a.order - b.order)
                  .map((lvl) => (
                    <label
                      key={lvl.id}
                      className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[[data-state=checked]]:border-accent"
                    >
                      <input
                        type="radio"
                        name="supportLevel"
                        className="size-4 accent-accent"
                        checked={supportLevelId === lvl.id}
                        onChange={() => setSupportLevelId(lvl.id)}
                      />
                      <span className="text-sm font-medium">{lvl.name}</span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("notesLabel")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                required
                minLength={5}
                placeholder={t("notesPlaceholder")}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={classifyLoading}>
              {classifyLoading ? t("submitting") : t("submitClassifyButton")}
            </Button>
            {latestAssessment && (
              <Button type="button" variant="outline" onClick={() => setReclassifying(false)}>
                {t("cancelReclassify")}
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Plan section — only once at least one assessment exists. */}
      {latestAssessment && !reclassifying && (
        <div className="space-y-4 border-t border-border pt-4">
          {plan && <Badge variant="secondary">{t("planStatusLabel")}: {tPlanStatus(plan.status)}</Badge>}

          {isApproved && (
            <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">{t("toolsLockedNotice")}</p>
          )}

          {/* Batch 8 (new issue 1): was sm:grid-cols-2 — 8 tool checkboxes
              in 2 columns inside this card's actual available width (the
              document panel takes flex-[1.7] of the row, leaving this
              card comparatively narrow) forced multi-line label wrapping
              and a cramped, "messy" look. Single column gives each row
              the full card width to breathe. */}
          <div className="grid gap-3">
            {TOOL_CODES.map((code) => {
              const meta = TOOL_CODE_LABELS[code];
              return (
                <label
                  key={code}
                  className="flex items-start gap-3 rounded-md border border-border p-3 has-[[data-state=checked]]:border-accent"
                >
                  <Checkbox checked={selected.has(code)} disabled={isApproved} onCheckedChange={() => toggleTool(code)} />
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

          {!isApproved && (
            <Button type="button" variant="outline" onClick={handleSaveTools} disabled={planLoading}>
              {t("saveToolsButton")}
            </Button>
          )}

          <div className="flex gap-2">
            {!isApproved && plan && (
              <Button type="button" variant="accent" className="flex-1" onClick={handleApprove} disabled={planLoading}>
                {t("approveButton")}
              </Button>
            )}
            {!isApproved && !plan && (
              <Button type="button" variant="accent" className="flex-1" onClick={handleSaveTools} disabled={planLoading}>
                {t("createPlanButton")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleReturnToStudent} disabled={planLoading}>
              {t("sendBackButton")}
            </Button>
          </div>

          {isApproved && (
            <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-4">
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
                  <Button type="button" onClick={handleRevise} disabled={planLoading}>
                    {t("saveRevisionButton")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
