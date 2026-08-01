"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

const ROLE_OPTIONS = [
  { value: "student", label: "طالب" },
  { value: "faculty", label: "عضو هيئة تدريس" },
  { value: "specialist", label: "مختص" },
  { value: "admin", label: "مسؤول النظام" },
];

export function CreateUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await createUser({ email, password, role });
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? "تعذر إنشاء المستخدم");
      return;
    }
    toast.success("تم إنشاء المستخدم");
    setEmail("");
    setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-4 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="new-email">البريد الإلكتروني</Label>
        <Input id="new-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">كلمة المرور</Label>
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
        <Label>الدور</Label>
        <Select value={role} onValueChange={(v) => setRole(v ?? "student")}>
          <SelectTrigger>
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
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "جاري الإنشاء..." : "إضافة مستخدم"}
      </Button>
    </form>
  );
}
