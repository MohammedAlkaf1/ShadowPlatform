import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertSpecialistAssigned } from "@/lib/specialist-access";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssessForm } from "./assess-form";

export default async function AssessStudentPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [categoriesRaw, supportLevels, pastAssessments] = await Promise.all([
    db.category.findMany({ include: { conditions: true }, orderBy: { nameAr: "asc" } }),
    db.supportLevel.findMany({ orderBy: { order: "asc" } }),
    db.assessment.findMany({
      where: { studentProfileId },
      include: { condition: { include: { category: true } }, supportLevel: true },
      orderBy: { assessedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">تقييم الطالب</h1>
        <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
          {student.user.email}
        </p>
        <p className="text-sm text-muted-foreground">
          {student.studentNumber} — {student.major}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تقييم جديد</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessForm studentProfileId={studentProfileId} categories={categoriesRaw} supportLevels={supportLevels} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل التقييمات</CardTitle>
        </CardHeader>
        <CardContent>
          {pastAssessments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تقييمات سابقة</p>
          ) : (
            <ul className="space-y-3">
              {pastAssessments.map((a) => (
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
    </div>
  );
}
