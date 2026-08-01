"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  nameAr: string;
}
interface CategoryOption {
  id: string;
  nameAr: string;
  conditions: ConditionOption[];
}
interface SupportLevelOption {
  id: string;
  nameAr: string;
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
      toast.error("الرجاء اختيار الفئة والحالة الفرعية ومستوى الدعم");
      return;
    }
    setLoading(true);
    const result = await createAssessment({ studentProfileId, conditionId, supportLevelId, notes });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر حفظ التقييم");
      return;
    }
    toast.success("تم حفظ التقييم بنجاح");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>الفئة</Label>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v ?? "");
              setConditionId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر الفئة" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>الحالة الفرعية</Label>
          <Select value={conditionId} onValueChange={(v) => setConditionId(v ?? "")} disabled={!categoryId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الحالة الفرعية" />
            </SelectTrigger>
            <SelectContent>
              {conditions.map((cond) => (
                <SelectItem key={cond.id} value={cond.id}>
                  {cond.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>مستوى الدعم</Label>
          <Select value={supportLevelId} onValueChange={(v) => setSupportLevelId(v ?? "")}>
            <SelectTrigger>
              <SelectValue placeholder="اختر مستوى الدعم" />
            </SelectTrigger>
            <SelectContent>
              {supportLevels
                .sort((a, b) => a.order - b.order)
                .map((lvl) => (
                  <SelectItem key={lvl.id} value={lvl.id}>
                    {lvl.nameAr}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>ملاحظات المختص</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            required
            minLength={5}
            placeholder="اكتب ملاحظات التقييم..."
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "جاري الحفظ..." : "حفظ التقييم"}
      </Button>
    </form>
  );
}
