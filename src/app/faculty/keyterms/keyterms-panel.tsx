"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Sparkles, Plus, Upload, X } from "lucide-react";

interface SavedKeyterm {
  id: string;
  chapterTitle: string;
  term: string;
  source: "AI_EXTRACTED" | "MANUAL";
  approved: boolean;
  createdAt: string;
}

interface DraftTerm {
  term: string;
  source: "AI_EXTRACTED" | "MANUAL";
}

function TermChip({
  term,
  source,
  t,
  onRemove,
}: {
  term: string;
  source: "AI_EXTRACTED" | "MANUAL";
  t: ReturnType<typeof useTranslations>;
  // Approved glossary terms are permanent entries, not editable draft rows —
  // omit onRemove entirely for those instead of just disabling the button,
  // so there's no dead ✕ affordance on a chip nothing can delete from here.
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 ps-3 text-sm",
        onRemove ? "pe-1.5" : "pe-3"
      )}
    >
      <span dir="ltr">{term}</span>
      <Badge variant="secondary" className="bg-foreground/[.08] text-[10px] text-foreground">
        {source === "AI_EXTRACTED" ? t("sourceAi") : t("sourceManual")}
      </Badge>
      {onRemove && (
        <button
          type="button"
          title={t("removeTermButton")}
          onClick={onRemove}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

/**
 * Client panel for /faculty/keyterms. Two independent things live on this
 * page: (1) the already-approved, accumulated glossary for the selected
 * course, grouped into one collapsible section PER CHAPTER (see
 * LectureKeyterm.chapterTitle's schema comment — chapters are never merged,
 * each upload's approved batch keeps its own labeled section), and (2) an
 * upload-and-review flow for ONE chapter at a time that adds to it.
 * AI-extracted terms land in an editable DRAFT list the faculty member can
 * add to / remove from before a single "approve" action saves them under
 * the chapter title they typed — nothing from the draft reaches the
 * glossary (or students) until that explicit save, same "never
 * auto-publish AI output" rule the exam feature already established.
 */
export function KeytermsPanel({ courseCodes }: { courseCodes: string[] }) {
  const t = useTranslations("FacultyKeyterms");

  const [courseCode, setCourseCode] = useState<string>(courseCodes[0] ?? "");
  const [saved, setSaved] = useState<SavedKeyterm[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [chapterTitle, setChapterTitle] = useState("");
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

  // Groups the flat `saved` list into ordered [chapterTitle, terms[]]
  // sections for the accordion below. GET /api/faculty/keyterms already
  // sorts by chapterTitle then term, so insertion order here already
  // matches — just partitioning by the run of matching chapterTitle values.
  const savedByChapter = useMemo(() => {
    const groups: { chapterTitle: string; terms: SavedKeyterm[] }[] = [];
    for (const k of saved) {
      const last = groups[groups.length - 1];
      if (last && last.chapterTitle === k.chapterTitle) {
        last.terms.push(k);
      } else {
        groups.push({ chapterTitle: k.chapterTitle, terms: [k] });
      }
    }
    return groups;
  }, [saved]);

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
    if (!chapterTitle.trim()) {
      toast.error(t("errorChapterTitleRequired"));
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
    if (!chapterTitle.trim()) {
      toast.error(t("errorChapterTitleRequired"));
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
        body: JSON.stringify({ courseCode, chapterTitle: chapterTitle.trim(), terms: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorSaveFailed"));
        return;
      }
      toast.success(t("successApproved", { count: draft.length }));
      setDraft([]);
      setChapterTitle("");
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSaved(courseCode);
    } catch {
      toast.error(t("errorSaveFailed"));
    } finally {
      setSaving(false);
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
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="chapter-title">{t("chapterTitleLabel")}</Label>
              <Input
                id="chapter-title"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder={t("chapterTitlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="keyterm-file">{t("uploadLabel")}</Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm text-start hover:bg-muted"
              >
                <span className={cn("truncate", !fileName && "text-muted-foreground")}>
                  {fileName ?? t("noFileChosen")}
                </span>
                <Upload className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <input
                id="keyterm-file"
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
          </div>
          <Button type="button" variant="outline" disabled={extracting} onClick={handleExtract}>
            {extracting ? t("extractingButton") : t("extractButton")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            {chapterTitle.trim() ? t("draftSectionTitleWithChapter", { chapterTitle: chapterTitle.trim() }) : t("draftSectionTitle")}
          </CardTitle>
          {/* The one accent/terracotta action on this screen. */}
          <Button type="button" variant="accent" disabled={saving || draft.length === 0} onClick={handleApprove}>
            {saving ? t("savingButton") : t("approveButton", { count: draft.length })}
          </Button>
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
                  <TermChip term={d.term} source={d.source} t={t} onRemove={() => removeDraftTerm(index)} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2.5">
          <CardTitle className="text-base">{t("savedSectionTitle")}</CardTitle>
          <span className="rounded-full bg-foreground/[.08] px-[9px] py-[3px] text-[11.5px] font-bold text-muted-foreground">
            {t("totalTermCount", { count: saved.length })}
          </span>
        </CardHeader>
        <CardContent>
          {loadingSaved ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : savedByChapter.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noSavedTermsYet")}</p>
          ) : (
            <Accordion multiple defaultValue={savedByChapter.map((g) => g.chapterTitle)}>
              {savedByChapter.map((group) => (
                <AccordionItem key={group.chapterTitle} value={group.chapterTitle}>
                  <AccordionTrigger>
                    <span>
                      {group.chapterTitle}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t("chapterTermCount", { count: group.terms.length })}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionPanel>
                    <ul className="flex flex-wrap gap-2">
                      {group.terms.map((k) => (
                        <li key={k.id}>
                          {/* Approved terms are permanent glossary entries —
                              no onRemove, so TermChip renders without the ✕. */}
                          <TermChip term={k.term} source={k.source} t={t} />
                        </li>
                      ))}
                    </ul>
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
