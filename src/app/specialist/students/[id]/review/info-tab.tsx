"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createAssessment } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface InfoField {
  label: string;
  value: string;
}

/**
 * "معلومات الطالب" tab: a real-data field grid (name/student number/major/
 * academic stage/request date — no "academic supervisor" field, since none
 * exists anywhere in this schema) plus the internal-assessment box. The
 * classification form underneath IS that box — Assessment.notes is the one
 * real free-text "specialist notes" field, and the mock's "internal
 * assessment" box maps directly onto it; conditionId/supportLevelId stay
 * required alongside it because createAssessment's real write needs all
 * three together (see actions.ts).
 */
export function InfoTab({
  fields,
  studentProfileId,
  categories,
  supportLevels,
  latestAssessment,
}: {
  fields: InfoField[];
  studentProfileId: string;
  categories: CategoryOption[];
  supportLevels: SupportLevelOption[];
  latestAssessment: LatestAssessment | null;
}) {
  const router = useRouter();
  const t = useTranslations("SpecialistReview");

  const [reclassifying, setReclassifying] = useState(latestAssessment === null);
  const [categoryId, setCategoryId] = useState("");
  const [conditionId, setConditionId] = useState("");
  const [supportLevelId, setSupportLevelId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const conditions = categories.find((c) => c.id === categoryId)?.conditions ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!conditionId || !supportLevelId) {
      toast.error(t("errorMissingFields"));
      return;
    }
    setLoading(true);
    const result = await createAssessment({ studentProfileId, conditionId, supportLevelId, notes });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorSaveFailed"));
      return;
    }
    toast.success(t("successClassified"));
    setReclassifying(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[20px] border border-border bg-card p-7">
        <div className="grid grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-muted-foreground">{f.label}</span>
              <span className="text-[15px] font-bold text-foreground">{f.value}</span>
            </div>
          ))}
        </div>

        <div className="my-[26px] h-px bg-border" />

        <h3 className="text-[15.5px] font-extrabold">{t("internalAssessmentTitle")}</h3>

        {latestAssessment && !reclassifying ? (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-secondary/40 p-4">
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
          <form onSubmit={handleSubmit} className="mt-3 space-y-4">
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
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
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
                <Label>{t("internalNotesLabel")}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  required
                  minLength={5}
                  placeholder={t("internalNotesPlaceholder")}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? t("submitting") : t("submitClassifyButton")}
              </Button>
              {latestAssessment && (
                <Button type="button" variant="outline" onClick={() => setReclassifying(false)}>
                  {t("cancelReclassify")}
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
