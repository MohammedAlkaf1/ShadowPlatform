"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  nameAr: string;
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
      toast.error(result.error ?? "تعذر حفظ الخطة");
      return;
    }
    toast.success("تم حفظ الخطة");
    router.refresh();
  }

  async function handleApprove() {
    if (!planId) return;
    setLoading(true);
    const result = await approveSupportPlan(planId, studentProfileId);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر اعتماد الخطة");
      return;
    }
    toast.success("تم اعتماد الخطة");
    router.refresh();
  }

  async function handleRevise() {
    if (!planId || !newLevelId) {
      toast.error("الرجاء اختيار المستوى الجديد");
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
      toast.error(result.error ?? "تعذر تسجيل المراجعة");
      return;
    }
    toast.success("تم تسجيل مراجعة المستوى");
    setRevising(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
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
                <span className="block text-sm font-medium text-foreground">{meta.ar}</span>
                <span className="block text-xs text-muted-foreground">{meta.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {!isApproved && (
          <Button variant="outline" onClick={handleSave} disabled={loading}>
            حفظ الأدوات
          </Button>
        )}
        {!isApproved && planId && (
          <Button onClick={handleApprove} disabled={loading}>
            اعتماد الخطة
          </Button>
        )}
        {isApproved && (
          <Button variant="outline" onClick={() => setRevising((r) => !r)}>
            مراجعة مستوى الدعم
          </Button>
        )}
      </div>

      {revising && (
        <div className="space-y-3 rounded-md border border-border bg-secondary/40 p-4">
          <div className="space-y-2">
            <Label>المستوى الجديد</Label>
            <Select value={newLevelId} onValueChange={(v) => setNewLevelId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="اختر المستوى" />
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
          <div className="space-y-2">
            <Label>سبب المراجعة</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <Button onClick={handleRevise} disabled={loading}>
            حفظ المراجعة
          </Button>
        </div>
      )}
    </div>
  );
}
