import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function UnauthorizedPage() {
  const t = await getTranslations("Unauthorized");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-secondary px-4 py-24 text-center">
      <h1 className="text-3xl font-bold text-primary">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("message")}</p>
      <Button render={<Link href="/">{t("homeButton")}</Link>} />
    </div>
  );
}
