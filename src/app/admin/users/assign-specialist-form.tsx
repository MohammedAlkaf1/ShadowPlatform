"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { assignSpecialist } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Option {
  id: string;
  label: string;
}

export function AssignSpecialistForm({ specialists, students }: { specialists: Option[]; students: Option[] }) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const [specialistUserId, setSpecialistUserId] = useState("");
  const [studentProfileId, setStudentProfileId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!specialistUserId || !studentProfileId) {
      toast.error(t("errorSelectSpecialistAndStudent"));
      return;
    }
    setLoading(true);
    const result = await assignSpecialist({ specialistUserId, studentProfileId });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorAssignFailed"));
      return;
    }
    toast.success(t("successSpecialistAssigned"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2">
        <Label>{t("specialistLabel")}</Label>
        <Select value={specialistUserId} onValueChange={(v) => setSpecialistUserId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder={t("specialistPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {specialists.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("studentLabel")}</Label>
        <Select value={studentProfileId} onValueChange={(v) => setStudentProfileId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder={t("studentPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* The one terracotta action on this screen — matches the mockup's
          "عيّن المختص" button. Nothing else on /admin/users is accent
          (create-user/role/activate controls are all default/outline,
          tucked behind the "manage users" disclosure). */}
      {/* min-h-[52px]: matches the reference file's assign-button height
          exactly (min-height:52px), rather than the generic 44px minimum. */}
      <Button type="submit" variant="accent" disabled={loading} className="min-h-[52px]">
        {loading ? t("assigning") : t("assignButton")}
      </Button>
    </form>
  );
}
