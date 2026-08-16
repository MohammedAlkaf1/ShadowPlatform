import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EchoCard } from "@/components/ui/echo-card";
import { ManageResourcesDialog } from "./manage-resources-dialog";

export default async function FacultyStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const ctx = await requireRole("faculty", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyStudents");
  const params = await searchParams;

  // Faculty only ever sees students linked to THEM via FacultyCourseLink,
  // and only the approved accommodations JSON — never medical reports,
  // diagnosis/category, or support level. Admin viewing this page sees the
  // whole tenant's links instead (university-wide access).
  const [links, uploadedFileCount] = await Promise.all([
    db.facultyCourseLink.findMany({
      where: ctx.role === "admin" ? {} : { facultyUserId: ctx.userId },
      include: { studentProfile: { include: { user: { select: { email: true, fullName: true } } } } },
      orderBy: { courseCode: "asc" },
    }),
    // Cheap additive count for the 2nd side stat — same tenant/uploader
    // scoping as the existing upload flow, no new access surface.
    db.facultyResource.count({ where: { uploadedByUserId: ctx.userId, deletedAt: null } }),
  ]);

  // Access to a student's roster row is still an access to their record —
  // log one audit row per distinct student shown, not per course link row.
  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.studentProfileId)) continue;
    seen.add(link.studentProfileId);
    await logAudit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: "view_student_profile",
      resourceType: "FacultyCourseLink",
      targetStudentProfileId: link.studentProfileId,
    });
  }

  const distinctStudentCount = new Set(links.map((l) => l.studentProfileId)).size;
  const courseCodes = Array.from(new Set(links.map((l) => l.courseCode))).sort();
  const studentsWithAccommodations = new Set(
    links
      .filter((l) => {
        const acc = l.approvedAccommodations as Record<string, unknown> | null;
        return acc && Object.keys(acc).length > 0;
      })
      .map((l) => l.studentProfileId)
  ).size;

  const filteredLinks = params.course ? links.filter((l) => l.courseCode === params.course) : links;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Hero row: the one EchoCard on this screen wraps ONLY the
          distinct-students hero card. No sparkline here — "students in my
          courses" isn't a genuine week-over-week event stream the way
          registrations/assessments are, so a fake trend line was skipped
          rather than forced in. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <EchoCard className="lg:flex-[1.6]">
          <Card className="h-full justify-between">
            <CardHeader>
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">{t("heroTag")}</p>
              <CardTitle className="text-base font-medium text-muted-foreground">{t("heroStat")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-5xl font-bold text-primary">{distinctStudentCount}</p>
              <p className="text-sm text-muted-foreground">{t("heroDescription")}</p>
            </CardContent>
          </Card>
        </EchoCard>

        <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("courseCountStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{courseCodes.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("filesUploadedStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{uploadedFileCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t("accommodationsStat")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{studentsWithAccommodations}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">
              {t("listTitle")} ({filteredLinks.length})
            </CardTitle>
          </div>
          {/* No screen-level primary action here, deliberately — this page
              has no single "create new" action; every real action
              (managing files) is per-student, per-row, and already
              outline-styled, not terracotta. */}
          {courseCodes.length > 1 && (
            <form method="GET" className="flex items-center gap-2">
              <select
                name="course"
                defaultValue={params.course ?? ""}
                className="flex h-11 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t("allCourses")}</option>
                {courseCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                {t("filterButton")}
              </button>
            </form>
          )}
        </CardHeader>
        <CardContent>
          {filteredLinks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {params.course ? t("noStudentsForFilter") : t("noStudents")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableCourse")}</TableHead>
                  <TableHead>{t("tableStudentNumber")}</TableHead>
                  <TableHead>{t("tableStudentName")}</TableHead>
                  <TableHead>{t("tableAccommodations")}</TableHead>
                  {ctx.role === "faculty" && <TableHead>{t("tableFiles")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.map((link) => {
                  const accommodations = link.approvedAccommodations as Record<string, unknown> | null;
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.courseCode}</TableCell>
                      <TableCell>{link.studentProfile.studentNumber}</TableCell>
                      <TableCell>
                        <p>{link.studentProfile.user.fullName}</p>
                        <p dir="ltr" className="text-xs text-muted-foreground">
                          {link.studentProfile.user.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        {!accommodations || Object.keys(accommodations).length === 0 ? (
                          <span className="text-sm text-muted-foreground">{t("noAccommodations")}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(accommodations).map(([key, value]) => (
                              <Badge key={key} variant="secondary">
                                {key}: {String(value)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      {ctx.role === "faculty" && (
                        <TableCell>
                          {/* Present uniformly on every row regardless of whether this
                              student already has resources — the roster must never let
                              "has a manage button" vs "doesn't" become a distinguishing
                              signal. Outline-styled, not terracotta — see the header
                              comment above on this screen's primary-action rule. */}
                          <ManageResourcesDialog
                            studentProfileId={link.studentProfileId}
                            courseCode={link.courseCode}
                            studentLabel={`${link.studentProfile.user.fullName} (${link.studentProfile.studentNumber}) — ${link.studentProfile.user.email}`}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Hidden note: the real, enforced boundary (see the query comment
          above) is that faculty only ever see approvedAccommodations —
          never a student's medical report, diagnosis/category, support
          level, or specialist notes, and never students outside their own
          courses. */}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />
        {t("hiddenNote")}
      </p>
    </div>
  );
}
