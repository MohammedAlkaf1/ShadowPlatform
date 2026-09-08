"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EchoCard } from "@/components/ui/echo-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText } from "lucide-react";
import type { FacultyResourceCategory } from "@prisma/client";

interface TargetLink {
  id: string;
  studentProfileId: string;
  courseCode: string;
  studentName: string;
}

const CATEGORY_OPTIONS: FacultyResourceCategory[] = ["simplified_content", "visual_adjustment", "extra_exercises", "other"];

export function FacultyUploadPanel({ link }: { link: TargetLink }) {
  const t = useTranslations("FacultyUpload");
  const tRes = useTranslations("FacultyResources");

  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<FacultyResourceCategory | "">("");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setCategory("");
    setNote("");
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(tRes("errorFileRequired"));
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("studentProfileId", link.studentProfileId);
    formData.set("courseCode", link.courseCode);
    // The design drops the standalone "title" field — the server still
    // requires a non-empty one (see api/faculty/resources/route.ts), so it's
    // derived from the real category + course instead of asking the faculty
    // member to type a redundant label.
    const categoryLabel = category ? tRes(`category.${category}`) : tRes("category.other");
    formData.set("title", `${categoryLabel} — ${link.courseCode}`);
    if (category) formData.set("category", category);
    if (note.trim()) formData.set("note", note.trim());

    try {
      const res = await fetch("/api/faculty/resources", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? tRes("errorUploadFailed"));
        return;
      }
      toast.success(tRes("successUploaded"));
      resetForm();
    } catch {
      toast.error(tRes("errorUploadFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Hero panel: the one EchoCard on this screen. */}
      <EchoCard className="lg:flex-[1.4]">
        <Card className="items-center rounded-[24px] bg-primary py-9 text-center text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-1">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground/10">
              <Upload className="size-7" />
            </span>
            <Button
              type="button"
              size="cta"
              variant="accent"
              className="mt-5 rounded-full shadow-lg shadow-orange-950/20"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("chooseFileButton")}
            </Button>
            {fileName && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-foreground/15 px-3 py-2 text-xs font-semibold">
                <FileText className="size-3.5" />
                {fileName}
              </div>
            )}
            {/* Hidden real file input — the visible affordance is the
                "اختر ملفاً" button above, not a native file row. */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.pptx,.docx,.png,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </CardContent>
        </Card>
      </EchoCard>

      <Card className="lg:flex-1">
        <CardHeader>
          <CardTitle className="text-base">{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("courseLabel")}</Label>
              <p className="rounded-xl bg-muted px-4 py-3 text-sm font-medium text-foreground">{link.courseCode}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("targetStudentLabel")}</Label>
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-foreground">
                {link.studentName} <span className="text-muted-foreground">({t("targetStudentNote")})</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-category">{t("categoryFieldLabel")}</Label>
              <Select value={category || undefined} onValueChange={(v) => setCategory((v as FacultyResourceCategory) ?? "")}>
                <SelectTrigger id="resource-category">
                  <SelectValue placeholder={tRes("categoryPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {tRes(`category.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-note">{tRes("noteLabel")}</Label>
              <Textarea
                id="resource-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={t("notePlaceholder")}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={submitting} className="w-full">
              {submitting ? tRes("submitting") : t("submitButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
