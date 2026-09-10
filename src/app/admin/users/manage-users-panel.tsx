"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NavIcon } from "@/components/layout/nav-icon";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

interface ManageUserRow {
  id: string;
  fullName: string;
  fullNameEn: string | null;
  displayName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  org: string;
  active: boolean;
  needsAssignment: boolean;
  studentNumber: string | null;
}

const ROLE_FILTERS: (UserRole | "all")[] = ["all", "admin", "faculty", "specialist", "student"];
const STATUS_FILTERS = ["all", "active", "disabled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Batch 7 (issues D/E/F): the old design had TWO separate cards — a
 * compact read-only "المستخدمون" list (with a search filter, added in
 * batch 6) and this "إدارة المستخدمين" card (full table + create-user
 * form) tucked behind a <details> disclosure. The user wants ONE card:
 * this one, always expanded (no click-to-reveal), with the search filter
 * moved here to filter the real management table directly — not a
 * separate read-only list duplicating the same data. UsersListPanel (the
 * old compact-list client component) is deleted; this replaces it.
 *
 * Client Component so the search filter is interactive without converting
 * the whole page (Prisma access) to a Client Component — same reasoning
 * as the old UsersListPanel, just applied to the real management table
 * instead of a separate read-only copy.
 *
 * Batch (admin actions): search now also matches student number, and a
 * status filter (Active/Disabled) sits next to the existing role filter —
 * both client-side over the same already-fetched `users` list, same as the
 * existing name/email search and role filter.
 */
export function ManageUsersPanel({ users, currentUserId }: { users: ManageUserRow[]; currentUserId: string }) {
  const t = useTranslations("AdminUsers");
  const tRoles = useTranslations("Common.roles");
  const tActions = useTranslations("Common.actions");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.active) return false;
      if (statusFilter === "disabled" && u.active) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.studentNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, query, roleFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <CreateUserForm />

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[200px] max-w-[280px] flex-1">
          <NavIcon name="search" className="absolute start-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchUsersPlaceholder")}
            aria-label={t("searchUsersPlaceholder")}
            className="h-10 rounded-[11px] ps-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={cn(
                "flex min-h-9 items-center rounded-full border px-3.5 text-[12.5px] font-bold transition-colors",
                r === roleFilter
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {r === "all" ? t("roleFilterAll") : tRoles(r)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "flex min-h-9 items-center rounded-full border px-3.5 text-[12.5px] font-bold transition-colors",
                s === statusFilter
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {s === "all" ? tActions("all") : s === "active" ? tActions("active") : tActions("disabled")}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noUsersForSearch")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableUser")}</TableHead>
                <TableHead>{t("tableOrg")}</TableHead>
                <TableHead>{t("tableRole")}</TableHead>
                <TableHead>{t("tableStatus")}</TableHead>
                <TableHead className="text-end">{t("tableActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Batch 8: row tint switched from destructive/red to accent,
                  matching the badge fix below (same concept, same color
                  family now). */}
              {filtered.map((u) => (
                <TableRow key={u.id} className={u.needsAssignment ? "bg-accent/5" : undefined}>
                  {/* Name on top, email stacked directly below in the same
                      cell. Batch 8: dir="ltr" is on an inline span
                      nested inside the email <p>, NOT on the <p> itself —
                      see admin/audit-log/page.tsx's comment for why a
                      dir="ltr" block-level <p> breaks RTL alignment
                      against its sibling <p>. */}
                  <TableCell className="font-medium">
                    <p>{u.displayName}</p>
                    <p className="text-xs font-normal text-muted-foreground">
                      <span dir="ltr">{u.email}</span>
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.org}</TableCell>
                  <TableCell>
                    <span className="inline-block rounded-md bg-foreground/[.08] px-2.5 py-1 text-xs font-bold text-muted-foreground">
                      {u.roleLabel}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center text-xs font-bold",
                        u.active ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                      )}
                    >
                      {u.active ? t("statusActive") : t("statusDisabled")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={{
                        id: u.id,
                        fullName: u.fullName,
                        fullNameEn: u.fullNameEn,
                        email: u.email,
                        role: u.role,
                        studentNumber: u.studentNumber,
                      }}
                      active={u.active}
                      isSelf={u.id === currentUserId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
