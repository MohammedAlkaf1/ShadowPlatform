"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadDocument } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setLoading(true);
    const formData = new FormData(formRef.current);
    const result = await uploadDocument(formData);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر رفع الملف");
      return;
    }
    toast.success("تم رفع المستند بنجاح");
    formRef.current.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="file">رفع مستند طبي (PDF فقط)</Label>
        <Input id="file" name="file" type="file" accept="application/pdf" required />
      </div>
      <Button type="submit" disabled={loading} className="sm:w-40">
        {loading ? "جاري الرفع..." : "رفع المستند"}
      </Button>
    </form>
  );
}
