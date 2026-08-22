"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

interface ExamForToggle {
  id: string;
  title: string;
  availableAt: string | null;
  showResultsToStudents: boolean;
  questions: { text: string; options: { text: string; isCorrect: boolean }[] }[];
}

/**
 * Lets the faculty owner flip Exam.showResultsToStudents on an ALREADY
 * created exam (not just at initial creation, see new-exam-panel.tsx's own
 * copy of this checkbox) — there is no separate PATCH endpoint for this one
 * field, so this reuses PUT /api/faculty/exams/:id (the same full-replace
 * endpoint PublishButton already uses), resending the exam's own unchanged
 * title/availableAt/questions alongside the flipped flag.
 */
export function ShowResultsToggle({ exam }: { exam: ExamForToggle }) {
  const t = useTranslations("FacultyExams");
  const router = useRouter();
  const [checked, setChecked] = useState(exam.showResultsToStudents);
  const [saving, setSaving] = useState(false);

  async function handleChange(value: boolean) {
    setChecked(value);
    setSaving(true);
    try {
      const res = await fetch(`/api/faculty/exams/${exam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: exam.title,
          availableAt: exam.availableAt,
          showResultsToStudents: value,
          questions: exam.questions,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChecked(!value);
        toast.error(body.error ?? t("errorSaveFailed"));
        return;
      }
      router.refresh();
    } catch {
      setChecked(!value);
      toast.error(t("errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-start gap-3">
      <Checkbox className="mt-0.5" checked={checked} disabled={saving} onCheckedChange={(v) => handleChange(v === true)} />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{t("showResultsToStudentsLabel")}</span>
        <span className="block text-xs text-muted-foreground text-pretty">{t("showResultsToStudentsDescription")}</span>
      </span>
    </label>
  );
}
