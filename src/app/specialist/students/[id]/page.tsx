import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمدة",
  expired: "منتهية",
};

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studentProfileId } = await params;
  const ctx = await requireRole("specialist", "admin");
  await assertSpecialistAssigned(ctx, studentProfileId);

  const db = getTenantScopedPrisma(ctx.tenantId);

  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: { select: { email: true } } },
  });
  if (!student) notFound();

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "view_student_profile",
    resourceType: "StudentProfile",
    resourceId: studentProfileId,
    targetStudentProfileId: studentProfileId,
  });

  const [assessments, supportPlans, usageEvents] = await Promise.all([
    db.assessment.findMany({
      where: { studentProfileId },
      include: { condition: { include: { category: true } }, supportLevel: true },
      orderBy: { assessedAt: "desc" },
    }),
    db.supportPlan.findMany({
      where: { studentProfileId },
      orderBy: { createdAt: "desc" },
    }),
    db.usageEvent.findMany({
      where: { studentProfileId },
      select: { eventType: true },
    }),
  ]);

  // PlanRevision has no tenantId column (it scopes transitively through its
  // parent SupportPlan, which we've already tenant-scoped above), so this
  // read goes through the base prisma client filtered by the plan ids we
  // already verified belong to this tenant/student.
  const planRevisions = supportPlans.length
    ? await prisma.planRevision.findMany({
        where: { supportPlanId: { in: supportPlans.map((p) => p.id) } },
        include: { newSupportLevel: true, revisedBy: { select: { email: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const usageSummary = usageEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">ملف الطالب</h1>
          <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
            {student.user.email}
          </p>
          <p className="text-sm text-muted-foreground">
            {student.studentNumber} — {student.major} — {student.academicStage}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/specialist/students/${studentProfileId}/assess`}>التقييم</Link>} />
          <Button render={<Link href={`/specialist/students/${studentProfileId}/plan`}>خطة الدعم</Link>} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل التقييمات ({assessments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تقييمات بعد</p>
          ) : (
            <ul className="space-y-3">
              {assessments.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {a.condition.category.nameAr} — {a.condition.nameAr}
                  </p>
                  <p className="text-muted-foreground">مستوى الدعم: {a.supportLevel.nameAr}</p>
                  <p className="mt-1 text-foreground">{a.notes}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {a.assessedAt.toLocaleString("ar-SA")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">خطط الدعم ({supportPlans.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {supportPlans.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد خطط بعد</p>
          ) : (
            <ul className="space-y-2">
              {supportPlans.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <span dir="ltr" className="text-muted-foreground">
                    {p.createdAt.toLocaleDateString("ar-SA")}
                  </span>
                  <Badge variant="secondary">{PLAN_STATUS_LABELS[p.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل مراجعات مستوى الدعم ({planRevisions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {planRevisions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مراجعات مسجّلة</p>
          ) : (
            <ul className="space-y-3">
              {planRevisions.map((rev) => (
                <li key={rev.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">المستوى الجديد: {rev.newSupportLevel.nameAr}</p>
                  <p className="text-muted-foreground">{rev.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                    {rev.revisedBy.email} — {rev.createdAt.toLocaleString("ar-SA")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ملخص استخدام التطبيق</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(usageSummary).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات استخدام بعد</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {Object.entries(usageSummary).map(([eventType, count]) => (
                <li
                  key={eventType}
                  className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
                >
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {eventType}
                  </span>
                  <Badge variant="secondary">{count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
