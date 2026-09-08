import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { getSpecialistNavItems } from "@/components/layout/nav-items";
import { ProfileView } from "@/components/profile/profile-view";
import { localize } from "@/lib/localize";

export default async function SpecialistProfilePage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("Profile");
  const tRoles = await getTranslations("Common.roles");
  const locale = await getLocale();

  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });

  const navItems = await getSpecialistNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle=""
    >
      <ProfileView
        name={localize(user.fullName, user.fullNameEn, locale)}
        roleLabel={tRoles(user.role)}
        email={user.email}
        active={user.active}
        activeLabel={t("active")}
        disabledLabel={t("disabled")}
        accountStatusLabel={t("accountStatus")}
        detailsTitle={t("detailsTitle")}
        fields={[
          { label: t("fullName"), value: localize(user.fullName, user.fullNameEn, locale) },
          { label: t("email"), value: user.email },
          { label: t("org"), value: ctx.tenantName ?? "" },
          { label: t("roleLabel"), value: tRoles(user.role) },
          { label: t("joinDate"), value: formatDate(user.createdAt, locale) },
          { label: t("preferredLanguage"), value: user.locale === "en" ? t("localeEn") : t("localeAr") },
        ]}
      />
    </AppShell>
  );
}
