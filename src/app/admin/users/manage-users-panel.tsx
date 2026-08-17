"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateUserForm } from "./create-user-form";
import { UserRowActions } from "./user-row-actions";
import type { UserRole } from "@prisma/client";

interface ManageUserRow {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  active: boolean;
  needsAssignment: boolean;
}

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
 */
export function ManageUsersPanel({ users }: { users: ManageUserRow[] }) {
  const t = useTranslations("AdminUsers");
  const tActions = useTranslations("Common.actions");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold">{t("addUserTitle")}</p>
        <CreateUserForm />
      </div>

      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchUsersPlaceholder")}
        aria-label={t("searchUsersPlaceholder")}
        className="min-h-11 rounded-[14px]"
      />

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noUsersForSearch")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tableUser")}</TableHead>
                <TableHead>{t("tableRole")}</TableHead>
                <TableHead>{t("tableStatus")}</TableHead>
                <TableHead className="w-56">{t("tableActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Batch 8: row tint switched from destructive/red to accent,
                  matching the badge fix below (same concept, same color
                  family now). */}
              {filtered.map((u) => (
                <TableRow key={u.id} className={u.needsAssignment ? "bg-accent/5" : undefined}>
                  {/* Name on top, email stacked directly below in the same
                      cell. Role shown ONCE, as its own Badge — never
                      duplicated into the name text (see prisma/seed.ts's
                      batch-7 fix). Batch 8: dir="ltr" is on an inline span
                      nested inside the email <p>, NOT on the <p> itself —
                      see admin/audit-log/page.tsx's comment for why a
                      dir="ltr" block-level <p> breaks RTL alignment
                      against its sibling <p> (this was the actual,
                      screenshot-confirmed root cause of the "email on the
                      wrong side" bug, invisible to class-string
                      comparison). */}
                  <TableCell className="font-medium">
                    <p>{u.fullName}</p>
                    <p className="text-xs font-normal text-muted-foreground">
                      <span dir="ltr">{u.email}</span>
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{u.roleLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={u.active ? "secondary" : "destructive"}>
                        {u.active ? tActions("active") : tActions("disabled")}
                      </Badge>
                      {/* Batch 8 (new issue 2): was variant="destructive"
                          (red) — see admin/stats/page.tsx's comment. */}
                      {u.needsAssignment && (
                        <Badge variant="secondary" className="bg-accent/15 text-accent">
                          {t("needsAssignmentBadge")}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserRowActions userId={u.id} role={u.role} active={u.active} />
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
