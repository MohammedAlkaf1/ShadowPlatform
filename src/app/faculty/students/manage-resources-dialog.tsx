"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Trash2, Download, RefreshCw } from "lucide-react";

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

export function ManageResourcesDialog({
  studentProfileId,
  courseCode,
  studentLabel,
}: {
  studentProfileId: string;
  courseCode: string;
  studentLabel: string;
}) {
  const t = useTranslations("FacultyResources");
  const [open, setOpen] = useState(false);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("");
  const [note, setNote] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadResources = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/faculty/resources?studentProfileId=${encodeURIComponent(studentProfileId)}&courseCode=${encodeURIComponent(courseCode)}`
      );
      if (!res.ok) throw new Error();
      const body = await res.json();
      setResources(body.resources ?? []);
    } catch {
      toast.error(t("errorLoadingList"));
    } finally {
      setLoadingList(false);
    }
  }, [studentProfileId, courseCode, t]);

  useEffect(() => {
    if (!open) return;
    // Defer past the current microtask so the resulting setState calls
    // (inside loadResources) don't happen synchronously within the effect
    // body itself (react-hooks/set-state-in-effect).
    const timeoutId = setTimeout(() => {
      loadResources();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [open, loadResources]);

  function resetForm() {
    setTitle("");
    setCategory("");
    setNote("");
    setReplacingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error(t("errorFileRequired"));
      return;
    }
    if (!title.trim()) {
      toast.error(t("errorTitleRequired"));
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("studentProfileId", studentProfileId);
    formData.set("courseCode", courseCode);
    formData.set("title", title.trim());
    if (category) formData.set("category", category);
    if (note.trim()) formData.set("note", note.trim());
    if (replacingId) formData.set("resourceId", replacingId);

    try {
      const res = await fetch("/api/faculty/resources", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? t("errorUploadFailed"));
        return;
      }
      toast.success(replacingId ? t("successReplaced") : t("successUploaded"));
      resetForm();
      loadResources();
    } catch {
      toast.error(t("errorUploadFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/faculty/resources/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(t("errorDeleteFailed"));
        return;
      }
      toast.success(t("successDeleted"));
      loadResources();
    } catch {
      toast.error(t("errorDeleteFailed"));
    }
  }

  function beginReplace(resource: ResourceItem) {
    setReplacingId(resource.id);
    setTitle(resource.title);
    setCategory(resource.category ?? "");
    setNote(resource.note ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            {t("manageButton")}
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {studentLabel} — {courseCode}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="resource-file">{t("fileLabel")}</Label>
            <Input
              id="resource-file"
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.docx,.png,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resource-title">{t("titleLabel")}</Label>
            <Input
              id="resource-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resource-note">{t("noteLabel")}</Label>
            <Textarea id="resource-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? t("submitting") : replacingId ? t("submitReplace") : t("submitUpload")}
            </Button>
            {replacingId && (
              <Button type="button" variant="outline" onClick={resetForm}>
                {t("cancelReplace")}
              </Button>
            )}
          </div>
        </form>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">{t("existingListTitle")}</p>
          {loadingList ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noResources")}</p>
          ) : (
            <ul className="space-y-2">
              {resources.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 p-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {new Date(r.createdAt).toLocaleDateString("ar-SA")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("download")}
                      render={
                        <a href={`/api/faculty/resources/${r.id}/download`} target="_blank" rel="noreferrer">
                          <Download className="size-4" />
                        </a>
                      }
                    />
                    <Button size="icon-sm" variant="ghost" title={t("replace")} onClick={() => beginReplace(r)}>
                      <RefreshCw className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t("delete")}
                      onClick={() => handleDelete(r.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
