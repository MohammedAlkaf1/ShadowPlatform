import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function UnauthorizedPage() {
  const t = await getTranslations("Unauthorized");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-secondary px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("message")}</p>
      {/* Navigation link styled as a button — see the comment in
          specialist/queue/page.tsx for why this uses buttonVariants
          directly on <Link> instead of Button's `render` prop. */}
      <Link href="/" className={buttonVariants()}>
        {t("homeButton")}
      </Link>
    </div>
  );
}
