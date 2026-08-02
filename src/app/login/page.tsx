"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const t = useTranslations("Login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError(t("errorInvalidCredentials"));
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-secondary px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <LanguageSwitcher />
        </div>
        <Card className="border-border shadow-md">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold text-primary">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("submitButtonLoading") : t("submitButton")}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("noAccountText")}{" "}
              <a href="/register" className="text-accent font-medium hover:underline">
                {t("registerLink")}
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
