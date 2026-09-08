"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { uploadDocument } from "./actions";
import { Button } from "@/components/ui/button";
import { UploadCloud, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function UploadForm({ maxSizeLabel }: { maxSizeLabel: string }) {
  const router = useRouter();
  const t = useTranslations("StudentUpload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function submitFile(file: File) {
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadDocument(formData);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorUploadFailed"));
      return;
    }
    toast.success(t("successUploaded"));
    router.refresh();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void submitFile(file);
  }

  return (
    <div>
      {/* Figma: header row has ONLY the button, end-aligned — no page
          title repeated here (AppShell's own header already shows it). */}
      <div className="flex items-center justify-end">
        <Button type="button" variant="accent" className="gap-[9px] rounded-xl" onClick={() => fileInputRef.current?.click()}>
          <Plus className="size-4" />
          {t("uploadButton")}
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void submitFile(file);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "mt-4 flex min-h-[211px] w-full cursor-pointer flex-col items-center justify-center gap-[14px] rounded-[20px] border-[1.6px] border-dashed px-[25.6px] py-[45.6px] text-center shadow-[0px_1px_1px_rgba(30,42,58,0.05),0px_12px_14px_rgba(30,42,58,0.28)] transition-colors",
          dragOver ? "border-accent bg-accent/5" : "border-[#5b6470] bg-card"
        )}
      >
        {loading ? (
          <p className="text-[15px] text-muted-foreground">{t("uploading")}</p>
        ) : (
          <>
            <div className="flex size-[46px] items-center justify-center rounded-[14px] border-[0.8px] border-border bg-card">
              <UploadCloud className="size-[22px] text-muted-foreground" />
            </div>
            <p className="text-[15px] font-bold text-foreground">{t("dropzoneHint")}</p>
            <p className="text-[12.5px] text-muted-foreground">{t("dropzoneFormats", { size: maxSizeLabel })}</p>
          </>
        )}
      </div>
    </div>
  );
}
