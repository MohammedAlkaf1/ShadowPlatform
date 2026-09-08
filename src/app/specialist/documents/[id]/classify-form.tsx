"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { createAssessment, returnRequestToStudent } from "../../students/[id]/review/actions";
import { markDocumentReviewed } from "../actions";
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
  order: number;
}

// The 3 real SupportLevel rows (order 1/2/3), described the way the design
// reference's 3 static radio options read ("دعم أساسي – ترتيبات صفية" etc.)
// — labels/descriptions here, NOT the level's own name, which stays
// Common.supportLevel's shorter "خفيف/متوسط/مكثف" used everywhere else.
const LEVEL_COPY: Record<number, { ar: string; ardesc: string; en: string; endesc: string }> = {
  1: { ar: "دعم أساسي", ardesc: "ترتيبات صفية", en: "Basic support", endesc: "Classroom arrangements" },
  2: { ar: "دعم موسّع", ardesc: "تفريغ ومواد مكيّفة", en: "Extended support", endesc: "Transcription and adapted materials" },
  3: { ar: "دعم مكثف", ardesc: "متابعة أسبوعية", en: "Intensive support", endesc: "Weekly follow-up" },
};

export function DocumentClassifyForm({
  documentId,
  studentProfileId,
  alreadyReviewed,
  categories,
  supportLevels,
  labels,
}: {
  documentId: string;
  studentProfileId: string;
  alreadyReviewed: boolean;
  categories: CategoryOption[];
  supportLevels: SupportLevelOption[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [categoryId, setCategoryId] = useState("");
  const [conditionId, setConditionId] = useState("");
  // Defaults to the "دعم موسّع" (order 2) level, matching the design's
  // default-selected radio — a starting suggestion, not a submitted value,
  // since the specialist still has to confirm category/condition to save.
  const [supportLevelId, setSupportLevelId] = useState(() => supportLevels.find((l) => l.order === 2)?.id ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const conditions = categories.find((c) => c.id === categoryId)?.conditions ?? [];

  async function handleApprove() {
    if (!conditionId || !supportLevelId) {
      toast.error(labels.errorMissingFields);
      return;
    }
    setLoading(true);
    const result = await createAssessment({ studentProfileId, conditionId, supportLevelId, notes });
    if (!result.ok) {
      setLoading(false);
      toast.error(result.error ?? labels.errorSaveFailed);
      return;
    }
    const reviewResult = await markDocumentReviewed(documentId, studentProfileId);
    setLoading(false);
    if (!reviewResult.ok) {
      toast.error(reviewResult.error ?? labels.errorSaveFailed);
      return;
    }
    toast.success(labels.successApproved);
    router.refresh();
  }

  async function handleSendBack() {
    setLoading(true);
    const result = await returnRequestToStudent(studentProfileId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? labels.errorSaveFailed);
      return;
    }
    toast.success(labels.successReturned);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-[20px] border border-border bg-card p-6">
      <h3 className="text-[15.5px] font-extrabold">{labels.classifyTitle}</h3>

      {alreadyReviewed && <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">{labels.alreadyReviewed}</p>}

      <div className="space-y-2">
        <Label>{labels.categoryLabel}</Label>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v ?? "");
            setConditionId("");
          }}
          disabled={alreadyReviewed}
        >
          <SelectTrigger>
            <SelectValue placeholder={labels.categoryPlaceholder} />
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
        <Label>{labels.conditionLabel}</Label>
        <Select value={conditionId} onValueChange={(v) => setConditionId(v ?? "")} disabled={!categoryId || alreadyReviewed}>
          <SelectTrigger>
            <SelectValue placeholder={labels.conditionPlaceholder} />
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

      <div className="flex flex-col gap-2">
        {supportLevels
          .sort((a, b) => a.order - b.order)
          .map((lvl) => {
            const copy = LEVEL_COPY[lvl.order];
            return (
              <label
                key={lvl.id}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="supportLevel"
                  className="size-4 accent-accent"
                  checked={supportLevelId === lvl.id}
                  onChange={() => setSupportLevelId(lvl.id)}
                  disabled={alreadyReviewed}
                />
                <span>
                  <span className="block text-sm font-bold">{(locale === "en" ? copy?.en : copy?.ar) ?? lvl.order}</span>
                  <span className="block text-xs text-muted-foreground">{locale === "en" ? copy?.endesc : copy?.ardesc}</span>
                </span>
              </label>
            );
          })}
      </div>

      <div className="space-y-2">
        <Label>{labels.notesLabel}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder={labels.notesPlaceholder}
          disabled={alreadyReviewed}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="accent"
          size="lg"
          className="h-12 flex-1 text-[15px]"
          onClick={handleApprove}
          disabled={loading || alreadyReviewed}
        >
          {labels.approveButton}
        </Button>
        <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleSendBack} disabled={loading}>
          {labels.sendBackButton}
        </Button>
      </div>
    </div>
  );
}
