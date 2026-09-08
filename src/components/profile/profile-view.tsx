import { cn } from "@/lib/utils";

export interface ProfileField {
  label: string;
  value: string;
}

/**
 * Shared read-only profile layout used by every role's /profile page —
 * header card (name / role / email / active-status) + a details card with
 * a 2-column grid of label-on-top/value-below boxes. `fields` must always
 * be real account data (createdAt, email, tenant, studentNumber, locale,
 * etc.) — this app has no "last login" or "admin scope" tracking, so
 * those reference-mockup fields are intentionally not reproduced here
 * rather than being filled with fabricated values.
 */
export function ProfileView({
  name,
  roleLabel,
  email,
  active,
  activeLabel,
  disabledLabel,
  accountStatusLabel,
  detailsTitle,
  fields,
}: {
  name: string;
  roleLabel: string;
  email: string;
  active: boolean;
  activeLabel: string;
  disabledLabel: string;
  accountStatusLabel: string;
  detailsTitle: string;
  fields: ProfileField[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-5 rounded-[22px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
        <div>
          <p className="text-lg font-extrabold">{name}</p>
          <p className="mt-1 text-sm font-bold text-accent">{roleLabel}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span dir="ltr">{email}</span>
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs font-bold text-muted-foreground">{accountStatusLabel}</p>
          <span
            className={cn(
              "mt-1.5 inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold",
              active
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {active ? activeLabel : disabledLabel}
          </span>
        </div>
      </div>

      <div className="rounded-[22px] border border-border bg-card p-6 shadow-[0_8px_18px_rgba(30,42,58,0.1),0_2px_4px_rgba(30,42,58,0.06)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.36)]">
        <p className="text-base font-extrabold">{detailsTitle}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label} className="rounded-2xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-bold text-muted-foreground">{f.label}</p>
              <p className="mt-1 text-sm font-bold text-foreground">{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
