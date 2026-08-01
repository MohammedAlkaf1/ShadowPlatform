import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: "قيد الانتظار", tone: "bg-muted text-muted-foreground" },
  under_review: { label: "قيد المراجعة", tone: "bg-accent/15 text-accent" },
  approved: { label: "مقبول", tone: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "مرفوض", tone: "bg-destructive/15 text-destructive" },
};

export default async function StudentStatusPage() {
  const ctx = await requireRole("student");
  const db = getTenantScopedPrisma(ctx.tenantId);

  const studentProfile = await db.studentProfile.findUnique({
    where: { userId: ctx.userId },
  });

  // IMPORTANT: students never see their classification/category, support
  // level, specialist notes, or medical report contents — anywhere, by
  // design. This page only ever reads requestStatus + the enabled tool list
  // from an APPROVED support plan; it never touches Assessment or the
  // Document's contents.
  const approvedPlan = studentProfile
    ? await db.supportPlan.findFirst({
        where: { studentProfileId: studentProfile.id, status: "approved" },
        orderBy: { approvedAt: "desc" },
        include: { toolActivations: { where: { enabled: true } } },
      })
    : null;

  const status = studentProfile
    ? STATUS_LABELS[studentProfile.requestStatus] ?? STATUS_LABELS.pending
    : STATUS_LABELS.pending;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">حالة الطلب</h1>
        <p className="mt-1 text-sm text-muted-foreground">متابعة حالة طلب الدعم والأدوات المفعّلة في حسابك</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">حالة طلبك</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge className={status.tone} variant="secondary">
            {status.label}
          </Badge>
          {!studentProfile?.verified && (
            <p className="mt-3 text-sm text-muted-foreground">
              حسابك بانتظار التحقق من تسجيلك الجامعي من قِبل الجهة المختصة.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الأدوات المفعّلة في التطبيق</CardTitle>
        </CardHeader>
        <CardContent>
          {!approvedPlan || approvedPlan.toolActivations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا توجد أدوات مفعّلة حالياً. سيتم تفعيلها بعد اعتماد خطة الدعم الخاصة بك.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {approvedPlan.toolActivations.map((tool) => {
                const meta = TOOL_CODE_LABELS[tool.toolCode as ToolCodeValue];
                return (
                  <li
                    key={tool.id}
                    className="flex items-start gap-2 rounded-md border border-border bg-secondary/50 p-3"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{meta?.ar ?? tool.toolCode}</p>
                      <p className="text-xs text-muted-foreground">{meta?.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
