import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ManageResourcesDialog } from "./manage-resources-dialog";

export default async function FacultyStudentsPage() {
  const ctx = await requireRole("faculty", "admin");
  const db = getTenantScopedPrisma(ctx.tenantId);
  const t = await getTranslations("FacultyStudents");

  // Faculty only ever sees students linked to THEM via FacultyCourseLink,
  // and only the approved accommodations JSON — never medical reports,
  // diagnosis/category, or support level. Admin viewing this page sees the
  // whole tenant's links instead (university-wide access).
  const links = await db.facultyCourseLink.findMany({
    where: ctx.role === "admin" ? {} : { facultyUserId: ctx.userId },
    include: { studentProfile: { include: { user: { select: { email: true } } } } },
    orderBy: { courseCode: "asc" },
  });

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("listTitle")} ({links.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("noStudents")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableCourse")}</TableHead>
                  <TableHead>{t("tableStudentNumber")}</TableHead>
                  <TableHead>{t("tableEmail")}</TableHead>
                  <TableHead>{t("tableAccommodations")}</TableHead>
                  {ctx.role === "faculty" && <TableHead>{t("tableFiles")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const accommodations = link.approvedAccommodations as Record<string, unknown> | null;
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.courseCode}</TableCell>
                      <TableCell>{link.studentProfile.studentNumber}</TableCell>
                      <TableCell dir="ltr" className="text-end text-muted-foreground">
                        {link.studentProfile.user.email}
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
                              signal. */}
                          <ManageResourcesDialog
                            studentProfileId={link.studentProfileId}
                            courseCode={link.courseCode}
                            studentLabel={`${link.studentProfile.studentNumber} — ${link.studentProfile.user.email}`}
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
    </div>
  );
}
