"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateUserRole, setUserActive } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@prisma/client";

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "student", label: "طالب" },
  { value: "faculty", label: "عضو هيئة تدريس" },
  { value: "specialist", label: "مختص" },
  { value: "admin", label: "مسؤول النظام" },
];

export function UserRowActions({ userId, role, active }: { userId: string; role: UserRole; active: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRoleChange(newRole: string | null) {
    if (!newRole || newRole === role) return;
    setLoading(true);
    const result = await updateUserRole({ userId, role: newRole });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر تحديث الدور");
      return;
    }
    toast.success("تم تحديث الدور");
    router.refresh();
  }

  async function handleToggleActive() {
    setLoading(true);
    const result = await setUserActive(userId, !active);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر تحديث الحالة");
      return;
    }
    toast.success(active ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={handleRoleChange}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant={active ? "outline" : "default"} disabled={loading} onClick={handleToggleActive}>
        {active ? "تعطيل" : "تفعيل"}
      </Button>
    </div>
  );
}
