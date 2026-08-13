"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [studentNumber, setStudentNumber] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await createUser({ email, fullName, password, role, studentNumber });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorUserCreateFailed"));
      return;
    }
    toast.success(t("successUserCreated"));
    setEmail("");
    setFullName("");
    setPassword("");
    setStudentNumber("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-4 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="new-full-name">{t("fullNameLabel")}</Label>
        <Input
          id="new-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          minLength={2}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-email">{t("emailLabel")}</Label>
        <Input id="new-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">{t("passwordLabel")}</Label>
        <Input
          id="new-password"
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label>{t("roleLabel")}</Label>
        <Select value={role} onValueChange={(v) => setRole(v ?? "student")}>
          <SelectTrigger>
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
      {role === "student" && (
        <div className="space-y-2">
          <Label htmlFor="new-student-number">{t("studentNumberLabel")}</Label>
          <Input
            id="new-student-number"
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? t("addingUser") : t("addUserButton")}
      </Button>
    </form>
  );
}
