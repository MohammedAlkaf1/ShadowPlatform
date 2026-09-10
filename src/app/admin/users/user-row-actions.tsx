"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setUserActive } from "./actions";
import { EditUserDialog, type EditableUser } from "./edit-user-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  user: EditableUser;
  active: boolean;
  /** The signed-in admin's own userId — Disable/Delete are hidden for this row so an admin can't lock themselves out. */
  isSelf: boolean;
}

/**
 * Reference's row actions are two plain buttons — "تفاصيل" (details) and
 * "تعطيل"/"تنشيط" (disable/enable, tinted red/green). "تفاصيل" now
 * navigates to the user's real full-page profile (/admin/profile?userId=)
 * instead of opening a modal over the table — same destination as clicking
 * the sidebar's own profile card.
 *
 * Batch: added Edit (opens EditUserDialog) and Delete. Delete has no
 * separate destructive backend path — hard-deleting a User is unsafe here
 * (AuditLog.actorUserId has no cascade; User→StudentProfile→Documents/
 * Assessments/SupportPlans all cascade, which would destroy academic
 * records) — so Delete calls the exact same safe setUserActive(false) as
 * Disable, just behind its own confirmation modal naming the account, for
 * admins who reach for "Delete" instead of "Disable" out of habit.
 */
export function UserRowActions({ user, active, isSelf }: Props) {
  const router = useRouter();
  const t = useTranslations("AdminUsers");
  const tActions = useTranslations("Common.actions");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleToggleActive() {
    setLoading(true);
    const result = await setUserActive(user.id, !active);
    setLoading(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorStatusUpdateFailed"));
      return;
    }
    toast.success(active ? t("successUserDeactivated") : t("successUserActivated"));
    router.refresh();
  }

  async function handleDelete() {
    setLoading(true);
    const result = await setUserActive(user.id, false);
    setLoading(false);
    setDeleteOpen(false);
    if (!result.ok) {
      toast.error(result.error ?? t("errorStatusUpdateFailed"));
      return;
    }
    toast.success(t("successUserDeleted"));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={`/admin/profile?userId=${user.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-lg")}>
        {t("detailsButton")}
      </Link>
      <Button size="sm" variant="outline" className="rounded-lg" onClick={() => setEditOpen(true)}>
        {tActions("edit")}
      </Button>
      {!isSelf && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={handleToggleActive}
            className={
              active
                ? "rounded-lg border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20"
                : "rounded-lg border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400"
            }
          >
            {active ? t("disableButton") : t("enableButton")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => setDeleteOpen(true)}
            className="rounded-lg border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            {tActions("delete")}
          </Button>
        </>
      )}

      <EditUserDialog user={user} open={editOpen} onOpenChange={setEditOpen} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p className="font-bold">{user.fullName}</p>
            <p className="text-muted-foreground" dir="ltr">
              {user.email}
            </p>
            <p className="pt-2 text-muted-foreground">{t("deleteConfirmBody")}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} className="rounded-xl">
              {tActions("cancel")}
            </Button>
            <Button
              type="button"
              disabled={loading}
              onClick={handleDelete}
              className="rounded-xl bg-destructive text-white hover:bg-destructive/90"
            >
              {tActions("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
