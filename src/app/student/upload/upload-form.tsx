"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { uploadDocument } from "./actions";
import { EchoCard } from "@/components/ui/echo-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UploadCloud, FileText } from "lucide-react";

export function UploadForm() {
  const router = useRouter();
  const t = useTranslations("StudentUpload");
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setLoading(true);
    const formData = new FormData(formRef.current);
    const result = await uploadDocument(formData);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorUploadFailed"));
      return;
    }
    toast.success(t("successUploaded"));
    formRef.current.reset();
    setFileName(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      {/* Hero panel: the one EchoCard on this screen. */}
      <EchoCard className="lg:flex-[1.4]">
        <Card className="items-center bg-primary py-9 text-center text-primary-foreground">
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
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="file">{t("fileLabel")}</Label>
              <Input
                id="file"
                name="file"
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t("uploading") : t("uploadButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
