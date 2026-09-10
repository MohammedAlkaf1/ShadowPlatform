"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateUserProfile } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_VALUES = ["student", "faculty", "specialist", "admin"] as const;

export interface EditableUser {
  id: string;
  fullName: string;
  fullNameEn: string | null;
  email: string;
  role: (typeof ROLE_VALUES)[number];
  studentNumber: string | null;
}

/**
 * Admin-only "Edit user" dialog — same field set/labels as CreateUserForm
 * (Arabic name required, English name optional) plus email and role, so an
 * admin can correct any of these without recreating the account. Password
 * is intentionally not editable here (no reset-password mechanism exists
 * yet — see the login page's "Forgot password" comment).
 */
export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: EditableUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const tRoles = useTranslations("Common.roles");
  const tActions = useTranslations("Common.actions");

  const [fullName, setFullName] = useState(user.fullName);
  const [fullNameEn, setFullNameEn] = useState(user.fullNameEn ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<(typeof ROLE_VALUES)[number]>(user.role);
  const [studentNumber, setStudentNumber] = useState(user.studentNumber ?? "");
  const [loading, setLoading] = useState(false);

  function resetToUser() {
    setFullName(user.fullName);
    setFullNameEn(user.fullNameEn ?? "");
    setEmail(user.email);
    setRole(user.role);
    setStudentNumber(user.studentNumber ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await updateUserProfile({
      userId: user.id,
      email,
      fullName,
      fullNameEn,
      role,
      studentNumber,
    });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorUserUpdateFailed"));
      return;
    }
    toast.success(t("successUserUpdated"));
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) resetToUser();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editUserTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="edit-full-name">{t("fullNameLabel")}</Label>
            <Input
              id="edit-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              minLength={2}
              required
              className="h-11 rounded-xl bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-full-name-en">{t("fullNameEnLabel")}</Label>
            <Input
              id="edit-full-name-en"
              dir="ltr"
              value={fullNameEn}
              onChange={(e) => setFullNameEn(e.target.value)}
              className="h-11 rounded-xl bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">{t("emailLabel")}</Label>
            <Input
              id="edit-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-student-number">{t("studentNumberLabel")}</Label>
            <Input
              id="edit-student-number"
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              disabled={role !== "student"}
              className="h-11 rounded-xl bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("roleLabel")}</Label>
            <Select value={role} onValueChange={(v) => setRole((v as (typeof ROLE_VALUES)[number]) ?? "student")}>
              <SelectTrigger className="h-11 rounded-xl bg-background">
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              {tActions("cancel")}
            </Button>
            <Button type="submit" disabled={loading} className="rounded-xl">
              {loading ? t("savingChanges") : t("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
