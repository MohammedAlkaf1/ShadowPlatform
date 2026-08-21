"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PencilLine, Sparkles, Plus, Trash2, UploadCloud } from "lucide-react";

interface DraftOption {
  text: string;
  isCorrect: boolean;
}

interface DraftQuestion {
  text: string;
  options: DraftOption[];
}

function emptyQuestion(): DraftQuestion {
  return {
    text: "",
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

type Mode = "choose" | "manual" | "ai";

/**
 * Client panel for /faculty/exams/new. Presents the two creation paths as
 * two explicit, clearly-separated cards up front (hard requirement from the
 * spec, not a hidden toggle) — picking one reveals a shared question-editor
 * form. AI-generated questions land in the SAME editable draft state as
 * manually-typed ones; nothing about the editor below distinguishes "AI
 * draft" from "hand-typed" once questions are loaded into state, which is
 * exactly the point — the teacher can edit/delete/add either kind freely
 * before saving, and nothing is persisted or visible to students until they
 * explicitly click save/publish.
 */
export function NewExamPanel({ courseCodes }: { courseCodes: string[] }) {
  const t = useTranslations("FacultyExams");
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("choose");
  const [title, setTitle] = useState("");
  const [courseCode, setCourseCode] = useState<string>(courseCodes[0] ?? "");
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [saving, setSaving] = useState(false);

  // AI-generation sub-state.
  const [aiQuestionCount, setAiQuestionCount] = useState("10");
  const [aiFileName, setAiFileName] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const source = useRef<"MANUAL" | "AI_GENERATED">("MANUAL");

  if (courseCodes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noCourseLinks")}</CardContent>
      </Card>
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  function updateQuestionText(index: number, text: string) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, text } : q)));
  }

  function updateOptionText(qIndex: number, oIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qIndex ? q : { ...q, options: q.options.map((o, j) => (j === oIndex ? { ...o, text } : o)) }
      )
    );
  }

  function markCorrect(qIndex: number, oIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i !== qIndex ? q : { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oIndex })) }
      )
    );
  }

  function addOption(qIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) => (i !== qIndex ? q : { ...q, options: [...q.options, { text: "", isCorrect: false }] }))
    );
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) => {
        if (i !== qIndex) return q;
        const options = q.options.filter((_, j) => j !== oIndex);
        // If the removed option was the correct one, default back to the
        // first remaining option so the question never ends up with zero
        // correct answers marked.
        if (!options.some((o) => o.isCorrect) && options.length > 0) {
          options[0] = { ...options[0], isCorrect: true };
        }
        return { ...q, options };
      })
    );
  }

  async function handleGenerate() {
    const file = aiFileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("errorFileRequired"));
      return;
    }
    if (!courseCode) {
      toast.error(t("errorCourseRequired"));
      return;
    }

    setGenerating(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("courseCode", courseCode);
    formData.set("questionCount", aiQuestionCount);

    try {
      const res = await fetch("/api/faculty/exams/generate", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorGenerateFailed"));
        return;
      }
      const generated: DraftQuestion[] = (body.questions ?? []).map((q: DraftQuestion) => ({
        text: q.text,
        options: q.options,
      }));
      setQuestions(generated);
      source.current = "AI_GENERATED";
    } catch {
      toast.error(t("errorGenerateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  function validate(): string | null {
    if (!title.trim()) return t("errorTitleRequired");
    if (!courseCode) return t("errorCourseRequired");
    if (questions.length === 0) return t("errorQuestionsRequired");
    for (const q of questions) {
      const filledOptions = q.options.filter((o) => o.text.trim());
      const correctCount = q.options.filter((o) => o.isCorrect && o.text.trim()).length;
      if (!q.text.trim() || filledOptions.length < 2 || correctCount !== 1) {
        return t("errorQuestionTextRequired");
      }
    }
    return null;
  }

  async function handleSave(publish: boolean) {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/faculty/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          courseCode,
          source: source.current,
          availableAt: publish ? new Date().toISOString() : null,
          questions: questions.map((q) => ({
            text: q.text.trim(),
            options: q.options
              .filter((o) => o.text.trim())
              .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })),
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorSaveFailed"));
        return;
      }
      toast.success(publish ? t("successPublished") : t("successSaved"));
      router.push("/faculty/exams");
    } catch {
      toast.error(t("errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (mode === "choose") {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setMode("manual")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setMode("manual");
          }}
          className="min-h-44 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CardHeader>
            <PencilLine className="size-6 text-primary" />
            <CardTitle className="text-base">{t("optionManualTitle")}</CardTitle>
            <CardDescription className="text-pretty">{t("optionManualDescription")}</CardDescription>
          </CardHeader>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          onClick={() => setMode("ai")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setMode("ai");
          }}
          className="min-h-44 cursor-pointer transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <CardHeader>
            <Sparkles className="size-6 text-primary" />
            <CardTitle className="text-base">{t("optionAiTitle")}</CardTitle>
            <CardDescription className="text-pretty">{t("optionAiDescription")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{mode === "ai" ? t("optionAiTitle") : t("optionManualTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-title">{t("examTitleLabel")}</Label>
              <Input
                id="exam-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("examTitlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-course">{t("courseSelectLabel")}</Label>
              <Select value={courseCode || undefined} onValueChange={(v) => setCourseCode(v ?? "")}>
                <SelectTrigger id="exam-course" className="w-full">
                  <SelectValue placeholder={t("courseSelectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {courseCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "ai" && (
            <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-file">{t("aiUploadLabel")}</Label>
                  <Input
                    id="ai-file"
                    ref={aiFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setAiFileName(e.target.files?.[0]?.name ?? null)}
                  />
                  {aiFileName && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UploadCloud className="size-3.5" />
                      {aiFileName}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-count">{t("aiQuestionCountLabel")}</Label>
                  <Input
                    id="ai-count"
                    type="number"
                    min={1}
                    max={30}
                    value={aiQuestionCount}
                    onChange={(e) => setAiQuestionCount(e.target.value)}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" disabled={generating} onClick={handleGenerate}>
                {generating ? t("generatingButton") : t("generateButton")}
              </Button>
              {questions.length > 0 && (
                <p className="text-xs text-muted-foreground">{t("aiDraftNote")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("questionsTitle")}</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="size-3.5" data-icon="inline-start" />
            {t("addQuestionButton")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noQuestionsYet")}</p>
          ) : (
            questions.map((q, qIndex) => (
              <div key={qIndex} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`q-${qIndex}-text`}>{t("questionTextLabel")}</Label>
                    <Input
                      id={`q-${qIndex}-text`}
                      value={q.text}
                      onChange={(e) => updateQuestionText(qIndex, e.target.value)}
                      placeholder={t("questionTextPlaceholder")}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6"
                    title={t("removeQuestionButton")}
                    onClick={() => removeQuestion(qIndex)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>

                <div className="space-y-2">
                  {q.options.map((o, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <label className="flex min-h-11 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox checked={o.isCorrect} onCheckedChange={() => markCorrect(qIndex, oIndex)} />
                        {t("markCorrect")}
                      </label>
                      <Input
                        value={o.text}
                        onChange={(e) => updateOptionText(qIndex, oIndex, e.target.value)}
                        placeholder={t("optionLabel", { n: oIndex + 1 })}
                        className="flex-1"
                      />
                      {q.options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title={t("removeOptionButton")}
                          onClick={() => removeOption(qIndex, oIndex)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIndex)}>
                    <Plus className="size-3.5" data-icon="inline-start" />
                    {t("addOptionButton")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={saving} onClick={() => handleSave(false)}>
          {saving ? t("savingButton") : t("saveDraftButton")}
        </Button>
        {/* The one accent/terracotta action on this screen. */}
        <Button type="button" variant="accent" disabled={saving} onClick={() => handleSave(true)}>
          {saving ? t("savingButton") : t("publishButton")}
        </Button>
      </div>
    </div>
  );
}
