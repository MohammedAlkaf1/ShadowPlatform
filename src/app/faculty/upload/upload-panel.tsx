"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { formatDate } from "@/lib/format-date";
import { EchoCard } from "@/components/ui/echo-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, FileText, Trash2, Download, RefreshCw } from "lucide-react";

interface LinkOption {
  id: string;
  studentProfileId: string;
  courseCode: string;
  label: string;
}

interface ResourceItem {
  id: string;
  title: string;
  category: string | null;
  note: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export function FacultyUploadPanel({
  links,
  initialLinkId,
}: {
  links: LinkOption[];
  initialLinkId: string | null;
}) {
  const t = useTranslations("FacultyUpload");
  const tRes = useTranslations("FacultyResources");
  const locale = useLocale();

  const [linkId, setLinkId] = useState<string | null>(initialLinkId);
  const selectedLink = links.find((l) => l.id === linkId) ?? null;

  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadResources = useCallback(async () => {
    if (!selectedLink) {
      setResources([]);
      return;
    }
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/faculty/resources?studentProfileId=${encodeURIComponent(selectedLink.studentProfileId)}&courseCode=${encodeURIComponent(selectedLink.courseCode)}`
      );
      if (!res.ok) throw new Error();
      const body = await res.json();
      setResources(body.resources ?? []);
    } catch {
      toast.error(tRes("errorLoadingList"));
    } finally {
      setLoadingList(false);
    }
  }, [selectedLink, tRes]);

  useEffect(() => {
    // Deferred past the current microtask so the setState calls inside
    // loadResources don't happen synchronously within the effect body
    // itself (react-hooks/set-state-in-effect) — same pattern used by the
    // dialog this page replaces.
    const timeoutId = setTimeout(() => {
      loadResources();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [loadResources]);

  function resetForm() {
    setTitle("");
    setCategory("");
    setNote("");
    setReplacingId(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLink) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(tRes("errorFileRequired"));
      return;
    }
    if (!title.trim()) {
      toast.error(tRes("errorTitleRequired"));
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("studentProfileId", selectedLink.studentProfileId);
    formData.set("courseCode", selectedLink.courseCode);
    formData.set("title", title.trim());
    if (category) formData.set("category", category);
    if (note.trim()) formData.set("note", note.trim());
    if (replacingId) formData.set("resourceId", replacingId);

    try {
      const res = await fetch("/api/faculty/resources", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? tRes("errorUploadFailed"));
        return;
      }
      toast.success(replacingId ? tRes("successReplaced") : tRes("successUploaded"));
      resetForm();
      loadResources();
    } catch {
      toast.error(tRes("errorUploadFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/faculty/resources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(tRes("errorDeleteFailed"));
        return;
      }
      toast.success(tRes("successDeleted"));
      loadResources();
    } catch {
      toast.error(tRes("errorDeleteFailed"));
    }
  }

  function beginReplace(resource: ResourceItem) {
    setReplacingId(resource.id);
    setTitle(resource.title);
    setCategory(resource.category ?? "");
    setNote(resource.note ?? "");
  }

  if (links.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("noCourseLinks")}</CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Hero panel: the one EchoCard on this screen. Matches the mockup's
          dark bento upload hero (icon + title + description + "choose a
          file" affordance), not the dashboard bento (no stat number here —
          this screen isn't a dashboard). */}
      <EchoCard className="lg:flex-[1.4]">
        <Card className="items-center rounded-[24px] bg-primary py-9 text-center text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-1">
            <UploadCloud className="size-10" />
            <p className="mt-3 text-xl font-bold">{t("heroTitle")}</p>
            <p className="mt-1 max-w-sm text-sm text-primary-foreground/80">{t("heroDescription")}</p>
            <Button
              type="button"
              size="cta"
              variant="accent"
              className="mt-5 rounded-full"
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
              <Label htmlFor="link-select">{t("studentLabel")}</Label>
              <Select value={linkId ?? undefined} onValueChange={(v) => setLinkId(v ?? null)}>
                <SelectTrigger id="link-select">
                  <SelectValue placeholder={t("studentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {links.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-file">{tRes("fileLabel")}</Label>
              <Input
                id="resource-file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx,.docx,.png,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-title">{tRes("titleLabel")}</Label>
              <Input id="resource-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-note">{tRes("noteLabel")}</Label>
              <Textarea id="resource-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting || !selectedLink} className="flex-1">
                {submitting ? tRes("submitting") : replacingId ? tRes("submitReplace") : tRes("submitUpload")}
              </Button>
              {replacingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  {tRes("cancelReplace")}
                </Button>
              )}
            </div>
          </form>

          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">{tRes("existingListTitle")}</p>
            {!selectedLink ? (
              <p className="text-sm text-muted-foreground">{t("studentPlaceholder")}</p>
            ) : loadingList ? (
              <p className="text-sm text-muted-foreground">{tRes("loading")}</p>
            ) : resources.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tRes("noResources")}</p>
            ) : (
              <ul className="space-y-2">
                {resources.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 p-2"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        {/* Batch 8: dir="ltr" on an inline span, not the
                            block <p> — see admin/audit-log/page.tsx. */}
                        <p className="text-sm font-medium break-words">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          <span dir="ltr">{formatDate(new Date(r.createdAt), locale)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title={tRes("download")}
                        render={
                          <a href={`/api/faculty/resources/${r.id}/download`} target="_blank" rel="noreferrer">
                            <Download className="size-4" />
                          </a>
                        }
                      />
                      <Button size="icon-sm" variant="ghost" title={tRes("replace")} onClick={() => beginReplace(r)}>
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title={tRes("delete")} onClick={() => handleDelete(r.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
