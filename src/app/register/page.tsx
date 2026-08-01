"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerStudent } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const initialForm = {
  email: "",
  password: "",
  studentNumber: "",
  major: "",
  academicStage: "",
  phone: "",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof initialForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await registerStudent(form);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "حدث خطأ أثناء التسجيل");
      return;
    }
    router.push("/login?registered=1");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-secondary px-4 py-12">
      <Card className="w-full max-w-lg border-border shadow-md">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold text-primary">تسجيل طالب جديد</CardTitle>
          <CardDescription>أنشئ حسابك للتقديم على خدمات الدعم</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">البريد الإلكتروني الجامعي</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="studentNumber">الرقم الجامعي</Label>
                <Input
                  id="studentNumber"
                  value={form.studentNumber}
                  onChange={(e) => update("studentNumber", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الجوال</Label>
                <Input
                  id="phone"
                  dir="ltr"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="major">التخصص</Label>
                <Input
                  id="major"
                  value={form.major}
                  onChange={(e) => update("major", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="academicStage">المرحلة الدراسية</Label>
                <Input
                  id="academicStage"
                  value={form.academicStage}
                  onChange={(e) => update("academicStage", e.target.value)}
                  required
                  placeholder="مثال: السنة الثانية"
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري التسجيل..." : "إنشاء الحساب"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            لديك حساب بالفعل؟{" "}
            <a href="/login" className="text-accent font-medium hover:underline">
              تسجيل الدخول
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
