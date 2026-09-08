"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { uploadDocument } from "./actions";

const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Real re-upload action for a document flagged "needs_update" — uploads a
 * fresh document via the same uploadDocument action the main dropzone
 * uses (a new real Document row, since there's no separate "replace in
 * place" mutation), not a dead link.
 */
export function ReplaceButton({ label }: { label: string }) {
  const router = useRouter();
  const t = useTranslations("StudentUpload");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(file: File) {
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => fileInputRef.current?.click()}
        className="text-[13px] font-bold text-accent hover:underline disabled:opacity-50"
      >
        {loading ? t("uploading") : label}
      </button>
    </>
  );
}
