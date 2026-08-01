"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  const [specialistUserId, setSpecialistUserId] = useState("");
  const [studentProfileId, setStudentProfileId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!specialistUserId || !studentProfileId) {
      toast.error("الرجاء اختيار المختص والطالب");
      return;
    }
    setLoading(true);
    const result = await assignSpecialist({ specialistUserId, studentProfileId });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر التعيين");
      return;
    }
    toast.success("تم تعيين المختص للطالب");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2">
        <Label>المختص</Label>
        <Select value={specialistUserId} onValueChange={(v) => setSpecialistUserId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="اختر المختص" />
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
        <Label>الطالب</Label>
        <Select value={studentProfileId} onValueChange={(v) => setStudentProfileId(v ?? "")}>
          <SelectTrigger>
            <SelectValue placeholder="اختر الطالب" />
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
      <Button type="submit" disabled={loading}>
        {loading ? "جاري التعيين..." : "تعيين المختص"}
      </Button>
    </form>
  );
}
