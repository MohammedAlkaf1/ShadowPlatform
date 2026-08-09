import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { TOOL_CODE_LABELS, type ToolCodeValue } from "@/lib/tool-codes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Download, FileText } from "lucide-react";

const RESOURCE_CATEGORY_LABELS: Record<string, string> = {
  simplified_content: "تبسيط محتوى",
  visual_adjustment: "تعديل بصري (ألوان/خط)",
  extra_exercises: "تمارين إضافية",
  other: "أخرى",
};

const NEW_BADGE_WINDOW_DAYS = 3;

// Wrapped in its own function (rather than inlining `Date.now()` directly
// in the page component's body) so this server component's async render
// function doesn't trip the "impure function during render" lint rule,
// which flags bare Date.now()/Math.random() calls lexically inside a
// component regardless of it being a dynamic server component that's
// expected to read wall-clock time per-request.
function newBadgeCutoffDate(): Date {
  return new Date(Date.now() - NEW_BADGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

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

  // "Date the plan was last updated" — SupportPlan has no updatedAt column
  // in the schema, so this is computed (not stored) as the most recent of:
  // when the plan was created/approved, or its latest level revision. No
  // reason/detail from that revision is ever read here, only the timestamp.
  let planLastUpdated: Date | null = null;
  if (approvedPlan) {
    const latestRevision = await db.planRevision.findFirst({
      where: { supportPlanId: approvedPlan.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const candidates = [approvedPlan.createdAt, approvedPlan.approvedAt, latestRevision?.createdAt].filter(
      (d): d is Date => d !== null && d !== undefined
    );
    planLastUpdated = candidates.length > 0 ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
  }

  const status = studentProfile
    ? STATUS_LABELS[studentProfile.requestStatus] ?? STATUS_LABELS.pending
    : STATUS_LABELS.pending;

  // Faculty-uploaded custom resources — student sees only their own, and
  // this section is omitted ENTIRELY (not shown-but-empty) when there are
  // none, so its absence never reads as "you have zero" versus "doesn't
  // apply to you" — same non-distinguishing-empty-state principle as the
  // rest of this page.
  const facultyResources = studentProfile
    ? await db.facultyResource.findMany({
        where: { studentProfileId: studentProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { email: true } } },
      })
    : [];
  const newBadgeCutoff = newBadgeCutoffDate();

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
          {approvedPlan && planLastUpdated && (
            <p className="mb-4 text-xs text-muted-foreground" dir="ltr">
              آخر تحديث لخطتك: {planLastUpdated.toLocaleDateString("ar-SA")}
            </p>
          )}
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

      {facultyResources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">موارد من أستاذك</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {facultyResources.map((resource) => {
                const isNew = resource.createdAt >= newBadgeCutoff;
                return (
                  <li key={resource.id} className="rounded-md border border-border bg-secondary/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-accent" />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{resource.title}</p>
                            {isNew && (
                              <Badge variant="secondary" className="bg-accent/15 text-accent">
                                جديد
                              </Badge>
                            )}
                          </div>
                          {resource.category && (
                            <p className="text-xs text-muted-foreground">
                              {RESOURCE_CATEGORY_LABELS[resource.category] ?? resource.category}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground" dir="ltr">
                            {resource.uploadedBy.email} — {resource.createdAt.toLocaleDateString("ar-SA")}
                          </p>
                          {resource.note && <p className="mt-1 text-sm text-foreground">{resource.note}</p>}
                          {isNew && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              أضاف أستاذك مادة تعليمية جديدة في مقرر {resource.courseCode}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={`/api/student/faculty-resources/${resource.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                      >
                        <Download className="size-3.5" />
                        تنزيل
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
