"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandWordmark } from "@/components/layout/brand-mark";

/**
 * Known local/demo accounts (must match prisma/seed.ts's upsertUser calls —
 * this is a static display list, not a live query, since the login page
 * has no reason to touch the DB before a session exists). Role names reuse
 * the shared Common.roles namespace; everything else lives under Login.demo*.
 *
 * Dot colors are deliberately NOT accent/terracotta — the design reference
 * reserves that color for the one primary action per screen (the submit
 * button below), and these dots sit on cards, not buttons, but staying
 * off-accent entirely avoids any ambiguity.
 */
const DEMO_ACCOUNTS = [
  {
    role: "student" as const,
    email: "student@demo.shadow.sa",
    nameKey: "demoStudentName" as const,
    descriptionKey: "demoStudentDescription" as const,
    dotClassName: "bg-emerald-500",
  },
  {
    role: "faculty" as const,
    email: "faculty@demo.shadow.sa",
    nameKey: "demoFacultyName" as const,
    descriptionKey: "demoFacultyDescription" as const,
    dotClassName: "bg-sky-500",
  },
  {
    role: "specialist" as const,
    email: "specialist@demo.shadow.sa",
    nameKey: "demoSpecialistName" as const,
    descriptionKey: "demoSpecialistDescription" as const,
    dotClassName: "bg-violet-500",
  },
  {
    role: "admin" as const,
    email: "admin@demo.shadow.sa",
    nameKey: "demoAdminName" as const,
    descriptionKey: "demoAdminDescription" as const,
    dotClassName: "bg-primary",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const t = useTranslations("Login");
  const tRoles = useTranslations("Common.roles");
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

  // Demo-account cards are a LOCAL/TESTING CONVENIENCE ONLY: clicking one
  // fills in the email field and nothing else. This is a deliberate,
  // security-conscious departure from the design reference's own prototype
  // behavior (an interactive mockup with no real backend, where clicking a
  // demo card logs in instantly with client-side-only fake state). This
  // platform has a real backend and real authentication — a demo card must
  // never bypass signIn(), never autofill or expose a password anywhere in
  // the DOM/state, and never submit the form on its own. The specialist
  // still has to know (or be told out-of-band) the real demo password and
  // type it in and press the real submit button, same as any other account.
  function fillDemoEmail(demoEmail: string) {
    setEmail(demoEmail);
    setError(null);
    toast.info(t("demoAccountsFilled"));
  }

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      {/* Left pane: the actual sign-in form. */}
      <div className="relative flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 md:px-[72px]">
        <div className="absolute top-6 end-6">
          <ThemeToggle />
        </div>

        <div className="mx-auto w-full max-w-md">
          <BrandWordmark alt={tBrand("name")} className="h-9" />

          <h1 className="mt-8 text-[34px] leading-[1.35] font-extrabold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-[15px] leading-[1.8] text-muted-foreground">{t("subtitle")}</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
                className="min-h-[52px] rounded-[14px] text-base"
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
                className="min-h-[52px] rounded-[14px] text-base"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {/* The one terracotta/accent action on this screen. */}
            <Button
              type="submit"
              variant="accent"
              size="cta"
              className="w-full rounded-[16px]"
              disabled={loading}
            >
              {loading ? t("submitButtonLoading") : t("submitButton")}
            </Button>
          </form>

          {/* No password-reset flow exists anywhere in this app yet, so this
              is deliberately plain text, not a link/button that would
              promise a working destination it can't deliver — matches the
              mock's static appearance without faking functionality. */}
          <p className="mt-4 text-sm text-muted-foreground">{t("forgotPassword")}</p>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("noAccountText")}{" "}
            <a href="/register" className="font-medium text-foreground hover:underline">
              {t("registerLink")}
            </a>
          </p>
        </div>
      </div>

      {/* Right pane: demo accounts, fixed width on desktop, navy background
          via the sidebar tokens (matches the sidebar's own navy elsewhere
          in the app) regardless of light/dark theme — this panel is
          intentionally always navy-on-cream-text, like the sidebar. */}
      <div className="w-full shrink-0 bg-sidebar px-6 py-[52px] text-sidebar-foreground sm:px-10 md:w-[540px] md:px-10">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-[13px] font-bold text-sidebar-foreground">{t("demoAccountsTitle")}</h2>
          <p className="mt-1.5 text-[13.5px] leading-[1.8] text-sidebar-foreground/70">{t("demoAccountsSubtitle")}</p>

          <ul className="mt-[18px] space-y-2.5">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => fillDemoEmail(account.email)}
                  className="w-full rounded-[18px] border border-sidebar-border bg-sidebar-accent/40 px-[18px] py-4 text-start transition-colors hover:bg-sidebar-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-[15.5px] leading-[1.45] text-sidebar-foreground">
                      {tRoles(account.role)}
                    </span>
                    <span aria-hidden="true" className={`size-[9px] shrink-0 rounded-full ${account.dotClassName}`} />
                  </div>
                  <p className="mt-[3px] text-[12.5px] leading-[1.65] break-words text-sidebar-foreground/80" dir="ltr">
                    {t(account.nameKey)} · {account.email}
                  </p>
                  <p className="mt-[5px] text-[12.5px] leading-[1.75] break-words text-sidebar-foreground/60">
                    {t(account.descriptionKey)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
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
