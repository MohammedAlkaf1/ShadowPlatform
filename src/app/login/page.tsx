"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandWordmark } from "@/components/layout/brand-mark";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const t = useTranslations("Login");
  const tBrand = useTranslations("Brand");

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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#f5f2eb] p-4 dark:bg-background">
      <LanguageSwitcher className="absolute top-4 end-4" />

      <BrandWordmark alt={tBrand("name")} markClassName="h-10" />
      <h1 className="mt-5 text-[28px] font-extrabold text-foreground">{t("title")}</h1>

      <div className="mt-7 w-full max-w-md rounded-3xl border border-border bg-card px-[26px] pb-6 pt-[26px] shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <Label htmlFor="email" className="text-[12.5px] font-bold text-muted-foreground">
              {t("emailLabel")}
            </Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 min-h-[52px] rounded-[14px] border-border bg-background text-[14.5px]"
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-[12.5px] font-bold text-muted-foreground">
              {t("passwordLabel")}
            </Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 min-h-[52px] rounded-[14px] border-border bg-background text-base"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {/* The one terracotta/accent action on this screen. */}
          <Button
            type="submit"
            variant="accent"
            size="cta"
            className="mt-0.5 min-h-[54px] w-full rounded-2xl text-base font-bold shadow-[0_10px_24px_rgba(181,98,58,0.38)]"
            disabled={loading}
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </Button>
        </form>

        {/* No password-reset flow exists anywhere in this app yet, so this
            is deliberately plain text, not a link/button that would
            promise a working destination it can't deliver. */}
        <p className="mt-3.5 text-center text-[13px] font-semibold text-muted-foreground">{t("forgotPassword")}</p>
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
