import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { formatDate } from "@/lib/format-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

export default async function SpecialistQueuePage() {
  const ctx = await requireRole("specialist", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("SpecialistQueue");
  const tPlanStatus = await getTranslations("Common.planStatus");
  const tSupportLevel = await getTranslations("Common.supportLevel");
  const locale = await getLocale();

  // A specialist only ever sees students an admin has manually assigned to
  // them. Admins viewing this page see the whole tenant's queue instead.
  const assignments = await db.specialistAssignment.findMany({
    where: ctx.role === "admin" ? {} : { specialistUserId: ctx.userId },
    include: {
      studentProfile: {
        include: {
          user: { select: { email: true } },
          assessments: {
            orderBy: { assessedAt: "desc" },
            take: 1,
            include: { condition: { include: { category: true } }, supportLevel: true },
          },
          supportPlans: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
          mentorAlerts: { where: { status: "open" }, select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("listTitle")} ({assignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noStudents")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("tableStudent")}</TableHead>
                    <TableHead>{t("tableCategory")}</TableHead>
                    <TableHead>{t("tableSupportLevel")}</TableHead>
                    <TableHead>{t("tableLastAssessment")}</TableHead>
                    <TableHead>{t("tablePlanStatus")}</TableHead>
                    <TableHead>{t("tableOpenAlerts")}</TableHead>
                    <TableHead className="w-72">{t("tableActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const sp = a.studentProfile;
                    const lastAssessment = sp.assessments[0];
                    const lastPlan = sp.supportPlans[0];
                    const openAlertCount = sp.mentorAlerts.length;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <p className="font-medium">{sp.studentNumber}</p>
                          <p dir="ltr" className="text-xs text-muted-foreground">
                            {sp.user.email}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? (
                            <>
                              <p>{locale === "en" ? lastAssessment.condition.category.nameEn : lastAssessment.condition.category.nameAr}</p>
                              <p className="text-xs text-muted-foreground">
                                {locale === "en" ? lastAssessment.condition.nameEn : lastAssessment.condition.nameAr}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t("noAssessmentYet")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {lastAssessment ? tSupportLevel(String(lastAssessment.supportLevel.order)) : "—"}
                        </TableCell>
                        <TableCell dir="ltr" className="text-end text-sm text-muted-foreground">
                          {lastAssessment ? formatDate(lastAssessment.assessedAt, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          {lastPlan ? (
                            <Badge variant="secondary">{tPlanStatus(lastPlan.status)}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t("noPlan")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {openAlertCount > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="size-3" />
                              {openAlertCount}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {/* These are navigation links styled to look like buttons, not
                                actions — per Base UI's own Button docs, a <Link>/<a> should
                                never be swapped in via Button's `render` prop (that's reserved
                                for elements that can take on real button semantics); style the
                                link directly with buttonVariants instead. */}
                            <Link
                              href={`/specialist/students/${sp.id}`}
                              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                            >
                              {t("detailsButton")}
                            </Link>
                            <Link
                              href={`/specialist/students/${sp.id}/assess`}
                              className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                            >
                              {t("assessButton")}
                            </Link>
                            <Link
                              href={`/specialist/students/${sp.id}/plan`}
                              className={cn(buttonVariants({ size: "sm" }))}
                            >
                              {t("planButton")}
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
