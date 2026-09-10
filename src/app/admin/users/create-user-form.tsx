"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavIcon } from "@/components/layout/nav-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_VALUES = ["student", "faculty", "specialist", "admin"] as const;

export function CreateUserForm() {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const tRoles = useTranslations("Common.roles");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [fullNameEn, setFullNameEn] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [studentNumber, setStudentNumber] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await createUser({ email, fullName, fullNameEn, password, role, studentNumber });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorUserCreateFailed"));
      return;
    }
    toast.success(t("successUserCreated"));
    setEmail("");
    setFullName("");
    setFullNameEn("");
    setPassword("");
    setStudentNumber("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-foreground/[.08] text-foreground">
          <NavIcon name="userPlus" className="size-[18px]" />
        </span>
        <p className="text-[15.5px] font-extrabold">{t("addUserTitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="new-full-name">{t("fullNameLabel")}</Label>
          <Input
            id="new-full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("fullNamePlaceholder")}
            minLength={2}
            required
            className="h-11 rounded-xl bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-full-name-en">{t("fullNameEnLabel")}</Label>
          <Input
            id="new-full-name-en"
            dir="ltr"
            value={fullNameEn}
            onChange={(e) => setFullNameEn(e.target.value)}
            placeholder={t("fullNameEnPlaceholder")}
            className="h-11 rounded-xl bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-email">{t("emailLabel")}</Label>
          <Input
            id="new-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            required
            className="h-11 rounded-xl bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">{t("passwordLabel")}</Label>
          <Input
            id="new-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={8}
            required
            className="h-11 rounded-xl bg-background"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-student-number">{t("studentNumberLabel")}</Label>
          <Input
            id="new-student-number"
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
            placeholder={t("studentNumberPlaceholder")}
            disabled={role !== "student"}
            className="h-11 rounded-xl bg-background"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("roleLabel")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v ?? "student")}>
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
        <div className="flex items-end">
          <Button type="submit" disabled={loading} className="h-11 w-full gap-1.5 rounded-xl">
            <NavIcon name="plus" className="size-4" />
            {loading ? t("addingUser") : t("addUserButton")}
          </Button>
        </div>
      </form>
    </div>
  );
}
