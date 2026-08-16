"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";

interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  roleLabel: string;
}

/**
 * Client component so the name/email search filter can be interactive
 * (client-side, no round trip) without converting the whole /admin/users
 * page — which needs Prisma access — into a Client Component. The parent
 * Server Component fetches `users` once and passes down just the small
 * serializable subset this list actually displays (id/fullName/email plus
 * the already-localized role label, so this component doesn't need its
 * own Common.roles lookup for a raw UserRole enum value).
 */
export function UsersListPanel({ users }: { users: UserListItem[] }) {
  const t = useTranslations("AdminUsers");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <div>
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
        <ul className="divide-y divide-border">
          {filtered.map((u) => (
            <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-pretty">{u.fullName}</p>
                <p dir="ltr" className="text-xs text-pretty text-muted-foreground">
                  {u.email}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{u.roleLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
