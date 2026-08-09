"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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

const ROLE_VALUES: UserRole[] = ["student", "faculty", "specialist", "admin"];

export function UserRowActions({ userId, role, active }: { userId: string; role: UserRole; active: boolean }) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const tRoles = useTranslations("Common.roles");
  const tActions = useTranslations("Common.actions");
  const [loading, setLoading] = useState(false);

  async function handleRoleChange(newRole: string | null) {
    if (!newRole || newRole === role) return;
    setLoading(true);
    const result = await updateUserRole({ userId, role: newRole });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorRoleUpdateFailed"));
      return;
    }
    toast.success(t("successRoleUpdated"));
    router.refresh();
  }

  async function handleToggleActive() {
    setLoading(true);
    const result = await setUserActive(userId, !active);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorStatusUpdateFailed"));
      return;
    }
    toast.success(active ? t("successUserDeactivated") : t("successUserActivated"));
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={handleRoleChange}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_VALUES.map((r) => (
            <SelectItem key={r} value={r}>
              {tRoles(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant={active ? "outline" : "default"} disabled={loading} onClick={handleToggleActive}>
        {active ? tActions("deactivate") : tActions("activate")}
      </Button>
    </div>
  );
}
