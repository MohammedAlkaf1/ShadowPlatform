"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Plus, UploadCloud, X } from "lucide-react";

interface SavedKeyterm {
  id: string;
  term: string;
  source: "AI_EXTRACTED" | "MANUAL";
  approved: boolean;
  createdAt: string;
}

interface DraftTerm {
  term: string;
  source: "AI_EXTRACTED" | "MANUAL";
}

/**
 * Client panel for /faculty/keyterms. Two independent things live on this
 * page: (1) the already-approved, accumulated glossary for the selected
 * course (see LectureKeyterm's schema comment — this never shrinks except
 * by explicit per-term delete), and (2) an upload-and-review flow that adds
 * to it. AI-extracted terms land in an editable DRAFT list the faculty
 * member can add to / remove from before a single "approve" action saves
 * them — nothing from the draft reaches the glossary (or students) until
 * that explicit save, same "never auto-publish AI output" rule the exam
 * feature already established.
 */
export function KeytermsPanel({ courseCodes }: { courseCodes: string[] }) {
  const t = useTranslations("FacultyKeyterms");

  const [courseCode, setCourseCode] = useState<string>(courseCodes[0] ?? "");
  const [saved, setSaved] = useState<SavedKeyterm[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [draft, setDraft] = useState<DraftTerm[]>([]);
  const [newTermText, setNewTermText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function loadSaved(code: string) {
    if (!code) {
      setSaved([]);
      return;
    }
    setLoadingSaved(true);
    try {
      const res = await fetch(`/api/faculty/keyterms?courseCode=${encodeURIComponent(code)}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSaved(body.keyterms ?? []);
      }
    } finally {
      setLoadingSaved(false);
    }
  }

  useEffect(() => {
    // Fire-and-forget from an effect that itself does nothing synchronous —
    // loadSaved's own setState calls all happen after its first `await`
    // (or, for the empty-courseCode case, are the effect's only job so a
    // microtask hop here just avoids the synchronous-setState-in-effect
    // lint rule without changing behavior).
    void Promise.resolve().then(() => loadSaved(courseCode));
  }, [courseCode]);

  if (courseCodes.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noCourseLinks")}</CardContent>
      </Card>
    );
  }

  async function handleExtract() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("errorFileRequired"));
      return;
    }
    if (!courseCode) {
      toast.error(t("errorCourseRequired"));
      return;
    }

    setExtracting(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("courseCode", courseCode);

    try {
      const res = await fetch("/api/faculty/keyterms/extract", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorExtractFailed"));
        return;
      }
      const existingLower = new Set(saved.map((k) => k.term.toLowerCase()));
      const extracted: string[] = body.terms ?? [];
      const newOnes = extracted.filter((term) => !existingLower.has(term.toLowerCase()));
      setDraft((d) => {
        const draftLower = new Set(d.map((x) => x.term.toLowerCase()));
        const toAdd = newOnes.filter((term) => !draftLower.has(term.toLowerCase()));
        return [...d, ...toAdd.map((term) => ({ term, source: "AI_EXTRACTED" as const }))];
      });
      if (newOnes.length === 0 && extracted.length > 0) {
        toast.info(t("infoAllTermsAlreadySaved"));
      }
    } catch {
      toast.error(t("errorExtractFailed"));
    } finally {
      setExtracting(false);
    }
  }

  function addManualTerm() {
    const term = newTermText.trim();
    if (!term) return;
    const lower = term.toLowerCase();
    if (
      draft.some((d) => d.term.toLowerCase() === lower) ||
      saved.some((s) => s.term.toLowerCase() === lower)
    ) {
      toast.error(t("errorTermAlreadyExists"));
      return;
    }
    setDraft((d) => [...d, { term, source: "MANUAL" }]);
    setNewTermText("");
  }

  function removeDraftTerm(index: number) {
    setDraft((d) => d.filter((_, i) => i !== index));
  }

  async function handleApprove() {
    if (!courseCode) {
      toast.error(t("errorCourseRequired"));
      return;
    }
    if (draft.length === 0) {
      toast.error(t("errorNoDraftTerms"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/faculty/keyterms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode, terms: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorSaveFailed"));
        return;
      }
      toast.success(t("successApproved", { count: draft.length }));
      setDraft([]);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSaved(courseCode);
    } catch {
      toast.error(t("errorSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSaved(id: string) {
    const prev = saved;
    setSaved((s) => s.filter((k) => k.id !== id));
    try {
      const res = await fetch(`/api/faculty/keyterms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setSaved(prev);
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? t("errorSaveFailed"));
      }
    } catch {
      setSaved(prev);
      toast.error(t("errorSaveFailed"));
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("courseSelectLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={courseCode || undefined} onValueChange={(v) => setCourseCode(v ?? "")}>
            <SelectTrigger className="w-full sm:w-64">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t("extractSectionTitle")}
          </CardTitle>
          <CardDescription className="text-pretty">{t("extractSectionDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="keyterm-file">{t("uploadLabel")}</Label>
            <Input
              id="keyterm-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            {fileName && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <UploadCloud className="size-3.5" />
                {fileName}
              </p>
            )}
          </div>
          <Button type="button" variant="outline" disabled={extracting} onClick={handleExtract}>
            {extracting ? t("extractingButton") : t("extractButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("draftSectionTitle")}</CardTitle>
          <CardDescription className="text-pretty">{t("draftSectionDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="manual-term">{t("addManualTermLabel")}</Label>
              <Input
                id="manual-term"
                value={newTermText}
                onChange={(e) => setNewTermText(e.target.value)}
                placeholder={t("addManualTermPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addManualTerm();
                  }
                }}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addManualTerm}>
              <Plus className="size-3.5" data-icon="inline-start" />
              {t("addButton")}
            </Button>
          </div>

          {draft.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("noDraftTermsYet")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {draft.map((d, index) => (
                <li key={`${d.term}-${index}`}>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 ps-3 pe-1.5 text-sm">
                    <span dir="ltr">{d.term}</span>
                    <Badge variant={d.source === "AI_EXTRACTED" ? "secondary" : "outline"} className="text-[10px]">
                      {d.source === "AI_EXTRACTED" ? t("sourceAi") : t("sourceManual")}
                    </Badge>
                    <button
                      type="button"
                      title={t("removeTermButton")}
                      onClick={() => removeDraftTerm(index)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {draft.length > 0 && (
            <div>
              {/* The one accent/terracotta action on this screen. */}
              <Button type="button" variant="accent" disabled={saving} onClick={handleApprove}>
                {saving ? t("savingButton") : t("approveButton", { count: draft.length })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("savedSectionTitle", { courseCode })}</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSaved ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : saved.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noSavedTermsYet")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {saved.map((k) => (
                <li key={k.id}>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 ps-3 pe-1.5 text-sm">
                    <span dir="ltr">{k.term}</span>
                    <Badge variant={k.source === "AI_EXTRACTED" ? "secondary" : "outline"} className="text-[10px]">
                      {k.source === "AI_EXTRACTED" ? t("sourceAi") : t("sourceManual")}
                    </Badge>
                    <button
                      type="button"
                      title={t("removeTermButton")}
                      onClick={() => handleDeleteSaved(k.id)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
