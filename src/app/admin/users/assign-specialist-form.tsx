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

/**
 * Reference's isAssign form is a single narrow (max-width 470px) stacked
 * column — student field first, specialist second, button last — not the
 * old 3-column single-row grid. When a case row above was clicked
 * (`selectedStudent` set), the student field becomes a fixed read-only
 * display (matching the reference exactly) instead of an empty dropdown;
 * without a pre-selection it falls back to a real dropdown so the form is
 * still usable on its own.
 */
export function AssignSpecialistForm({
  specialists,
  students,
  selectedStudent,
}: {
  specialists: Option[];
  students: Option[];
  selectedStudent?: Option;
}) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const [specialistUserId, setSpecialistUserId] = useState("");
  const [studentProfileId, setStudentProfileId] = useState(selectedStudent?.id ?? "");
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
    <form onSubmit={handleSubmit} className="flex max-w-[470px] flex-col gap-4">
      <div className="space-y-2">
        <Label>{t("studentLabel")}</Label>
        {selectedStudent ? (
          <div className="flex h-11 items-center rounded-xl border border-input bg-muted/40 px-3.5 text-sm font-medium">
            {selectedStudent.label}
          </div>
        ) : (
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
        )}
      </div>
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
      {/* The one terracotta action on this screen — matches the reference's
          "عيّن المختص" button. min-h-[52px]: the reference's exact
          assign-button height. */}
      <Button type="submit" variant="accent" disabled={loading} className="min-h-[52px] rounded-xl">
        {loading ? t("assigning") : t("assignButton")}
      </Button>
    </form>
  );
}
