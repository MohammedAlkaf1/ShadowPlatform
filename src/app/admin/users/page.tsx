import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDateTime } from "@/lib/format-date";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavIcon } from "@/components/layout/nav-icon";
import { cn } from "@/lib/utils";
import { AssignSpecialistForm } from "./assign-specialist-form";
import { AppShell } from "@/components/layout/app-shell";
import { getAdminNavItems } from "@/components/layout/nav-items";
import { localize } from "@/lib/localize";

const CASE_TABS = ["all", "pending", "assigned"] as const;
type CaseTab = (typeof CASE_TABS)[number];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; student?: string }>;
}) {
  const ctx = await requireRole("admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("AdminUsers");
  const tRoles = await getTranslations("Common.roles");
  const locale = await getLocale();
  const { tab: tabParam, q, student: selectedStudentId } = await searchParams;
  const tab: CaseTab = CASE_TABS.includes(tabParam as CaseTab) ? (tabParam as CaseTab) : "all";

  const [users, assignments, documentCounts] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "asc" },
      include: { studentProfile: { select: { id: true, studentNumber: true, requestStatus: true, createdAt: true } } },
    }),
    db.specialistAssignment.findMany({
      include: {
        specialist: { select: { email: true, fullName: true, fullNameEn: true } },
        studentProfile: { include: { user: { select: { email: true, fullName: true, fullNameEn: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.document.groupBy({ by: ["studentProfileId"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);

  const docCountByStudentId = new Map(documentCounts.map((d) => [d.studentProfileId, d._count._all]));
  const specialistByStudentId = new Map(
    assignments.map((a) => [a.studentProfileId, localize(a.specialist.fullName, a.specialist.fullNameEn, locale)])
  );

  const caseloadBySpecialistId = new Map<string, number>();
  for (const a of assignments) {
    caseloadBySpecialistId.set(a.specialistUserId, (caseloadBySpecialistId.get(a.specialistUserId) ?? 0) + 1);
  }

  const specialists = users
    .filter((u) => u.role === "specialist" && u.active)
    .map((u) => ({
      id: u.id,
      label: `${localize(u.fullName, u.fullNameEn, locale)} - ${ctx.tenantName ?? ""} (${t("specialistLoadCount", { count: caseloadBySpecialistId.get(u.id) ?? 0 })})`,
    }));

  const allStudents = users.filter((u) => u.role === "student" && u.active && u.studentProfile);

  let cases = allStudents.map((u) => ({
    id: u.studentProfile!.id,
    name: localize(u.fullName, u.fullNameEn, locale),
    org: ctx.tenantName ?? "",
    docsCount: docCountByStudentId.get(u.studentProfile!.id) ?? 0,
    specialistName: specialistByStudentId.get(u.studentProfile!.id) ?? null,
  }));

  if (tab === "pending") cases = cases.filter((c) => !c.specialistName);
  if (tab === "assigned") cases = cases.filter((c) => c.specialistName);
  if (q) {
    const needle = q.toLowerCase();
    cases = cases.filter((c) => c.name.toLowerCase().includes(needle));
  }
  // Reference: pending-assignment cases surface above already-assigned ones.
  cases.sort((a, b) => Number(!!a.specialistName) - Number(!!b.specialistName));

  const students = allStudents.map((u) => ({
    id: u.studentProfile!.id,
    label: `${localize(u.fullName, u.fullNameEn, locale)} - ${ctx.tenantName ?? ""}`,
  }));
  const selectedStudent = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : undefined;
  const pendingCaseStudents = allStudents.filter((u) => !specialistByStudentId.has(u.studentProfile!.id));
  const pendingCasesCount = pendingCaseStudents.length;
  const notificationItems = pendingCaseStudents.slice(0, 6).map((u) => ({
    title: t("notificationNeedsAssignment", { name: localize(u.fullName, u.fullNameEn, locale) }),
    time: formatDateTime(u.studentProfile!.createdAt, locale),
  }));

  function tabHref(tb: CaseTab) {
    const params = new URLSearchParams();
    if (tb !== "all") params.set("tab", tb);
    if (q) params.set("q", q);
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }

  const navItems = await getAdminNavItems();

  return (
    <AppShell
      navItems={navItems}
      role={ctx.role}
      userEmail={ctx.userEmail ?? ""}
      userName={ctx.userFullName ?? ""}
      tenantName={ctx.tenantName ?? ""}
      title={t("title")}
      subtitle={t("subtitle")}
      notificationCount={pendingCasesCount}
      notificationItems={notificationItems}
    >
      <div className="mb-5 overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-[18px] pb-3.5">
          <p className="text-[17px] font-extrabold">{t("casesTitle")}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <form method="GET" className="relative min-w-[210px]">
              {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
              <NavIcon name="search" className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
              <Input type="search" name="q" defaultValue={q ?? ""} placeholder={t("caseSearchPlaceholder")} className="h-10 rounded-[11px] ps-9" />
            </form>
            <div className="flex gap-[3px] rounded-[11px] bg-foreground/[.08] p-[3px]">
              {CASE_TABS.map((tb) => (
                <Link
                  key={tb}
                  href={tabHref(tb)}
                  className={cn(
                    "flex min-h-[34px] items-center rounded-lg px-3.5 text-[12.5px] font-bold",
                    tb === tab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {t(`caseTab_${tb}`)}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-muted/40 px-5 py-2.5">
          <p className="flex-[2] text-[11px] font-bold text-muted-foreground">{t("caseStudent")}</p>
          <p className="flex-[1.1] text-[11px] font-bold text-muted-foreground">{t("caseDocs")}</p>
          <p className="flex-[1.6] text-[11px] font-bold text-muted-foreground">{t("caseSpecialist")}</p>
          <p className="flex-[1.3] text-[11px] font-bold text-muted-foreground">{t("caseStatus")}</p>
          <p className="flex-1 text-end text-[11px] font-bold text-muted-foreground">{t("tableActions")}</p>
        </div>
        {cases.length === 0 ? (
          <p className="px-5 py-11 text-center text-sm text-muted-foreground">{t("noCases")}</p>
        ) : (
          cases.map((c) => (
            <div key={c.id} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
              <div className="flex-[2]">
                <p className="text-[13.5px] font-bold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.org}</p>
              </div>
              <p className="flex-[1.1] text-[13px] text-muted-foreground">{t("caseDocsCount", { count: c.docsCount })}</p>
              <p className="flex-[1.6] text-[13px] font-bold">{c.specialistName ?? "—"}</p>
              <div className="flex-[1.3]">
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold",
                    c.specialistName
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {c.specialistName ? t("caseStatusAssigned") : t("caseStatusPending")}
                </span>
              </div>
              <div className="flex flex-1 justify-end">
                <Link
                  href={`/admin/users?student=${c.id}#assign-form`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg")}
                >
                  {c.specialistName ? t("caseReassign") : t("caseAssign")}
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <div id="assign-form" className="w-full self-stretch rounded-[22px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)] lg:flex-1">
          <p className="text-lg font-extrabold">{t("assignSpecialistTitle")}</p>
          <div className="mt-5">
            <AssignSpecialistForm specialists={specialists} students={students} selectedStudent={selectedStudent} />
          </div>
        </div>

        <div className="w-full self-stretch rounded-[22px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)] lg:w-[420px] lg:flex-none">
          <p className="text-base font-extrabold">{t("usersTitle")}</p>
          <div className="mt-3.5 flex flex-col">
            {users.map((u) => (
              <div key={u.id} className="border-b border-border py-3.5 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {tRoles.has(u.role) ? tRoles(u.role) : u.role}
                  </span>
                  <span className="text-end text-sm font-bold">{localize(u.fullName, u.fullNameEn, locale)}</span>
                </div>
                <p className="mt-0.5 text-end text-xs text-muted-foreground">
                  <span dir="ltr">{u.email}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
