import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";
import { ProfileView } from "@/components/profile/profile-view";
import { localize } from "@/lib/localize";

/**
 * Admin-only: `?userId=` lets the "تفاصيل" (details) button on the user
 * management table open any user's real profile here — without it, this
 * shows the viewer's own. Every field is real account data; there is no
 * "last login" or "admin scope" tracking in this schema, so those two
 * reference-mockup fields are replaced with join date and preferred
 * language (both real, both already stored on User) rather than invented.
 */
export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("Profile");
  const tRoles = await getTranslations("Common.roles");
  const locale = await getLocale();
  const { userId } = await searchParams;

  const user = await db.user.findUnique({
    where: { id: userId || ctx.userId },
    include: { studentProfile: { select: { studentNumber: true } } },
  });
  if (!user) {
    return null;
  }

  const org = user.role === "admin" ? t("orgPlatformAdmin") : (ctx.tenantName ?? "");
  const roleLabel = tRoles.has(user.role) ? tRoles(user.role) : user.role;

  const navItems = await getAdminNavItems();

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
        roleLabel={roleLabel}
        email={user.email}
        active={user.active}
        activeLabel={t("active")}
        disabledLabel={t("disabled")}
        accountStatusLabel={t("accountStatus")}
        detailsTitle={t("detailsTitle")}
        fields={[
          { label: t("fullName"), value: localize(user.fullName, user.fullNameEn, locale) },
          { label: t("email"), value: user.email },
          { label: t("org"), value: org },
          ...(user.studentProfile
            ? [{ label: t("studentNumber"), value: user.studentProfile.studentNumber || "—" }]
            : [{ label: t("roleLabel"), value: roleLabel }]),
          { label: t("joinDate"), value: formatDate(user.createdAt, locale) },
          { label: t("preferredLanguage"), value: user.locale === "en" ? t("localeEn") : t("localeAr") },
        ]}
      />
    </AppShell>
  );
}
