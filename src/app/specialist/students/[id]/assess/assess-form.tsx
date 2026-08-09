"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createAssessment } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function AssessForm({
  studentProfileId,
  categories,
  supportLevels,
}: {
  studentProfileId: string;
  categories: CategoryOption[];
  supportLevels: SupportLevelOption[];
}) {
  const router = useRouter();
  const t = useTranslations("SpecialistAssess");
  const [categoryId, setCategoryId] = useState<string>("");
  const [conditionId, setConditionId] = useState<string>("");
  const [supportLevelId, setSupportLevelId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const conditions = useMemo(
    () => categories.find((c) => c.id === categoryId)?.conditions ?? [],
    [categories, categoryId]
  );

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
    toast.success(t("successSaved"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          <Select value={supportLevelId} onValueChange={(v) => setSupportLevelId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder={t("supportLevelPlaceholder")} />
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

      <Button type="submit" disabled={loading}>
        {loading ? t("submitting") : t("submitButton")}
      </Button>
    </form>
  );
}
