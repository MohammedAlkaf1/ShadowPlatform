"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Publishes an existing draft exam by re-sending its own title/questions
 * unchanged with `availableAt` set to now. Reuses PUT /api/faculty/exams/:id
 * (the same endpoint the edit flow would use) rather than introducing a
 * separate "publish" endpoint — publishing is just one specific update to
 * availableAt, not a distinct state machine action server-side.
 */
export function PublishButton({ examId }: { examId: string }) {
  const t = useTranslations("FacultyExams");
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    try {
      const getRes = await fetch(`/api/faculty/exams/${examId}`);
      const getBody = await getRes.json().catch(() => ({}));
      if (!getRes.ok) {
        toast.error(getBody.error ?? t("errorSaveFailed"));
        return;
      }
      const exam = getBody.exam;

      const res = await fetch(`/api/faculty/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: exam.title,
          availableAt: new Date().toISOString(),
          // Carried through unchanged from the fetched exam — the update
          // schema requires this field, and omitting it would silently
          // reset it to the schema default (false) on every publish.
          showResultsToStudents: exam.showResultsToStudents,
          questions: exam.questions.map((q: { text: string; options: { text: string; isCorrect: boolean }[] }) => ({
            text: q.text,
            options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorSaveFailed"));
        return;
      }
      toast.success(t("successPublished"));
      router.refresh();
    } catch {
      toast.error(t("errorSaveFailed"));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Button type="button" variant="accent" disabled={publishing} onClick={handlePublish}>
      {publishing ? t("savingButton") : t("publishButton")}
    </Button>
  );
}
