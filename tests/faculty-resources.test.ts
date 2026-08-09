import "./setup";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest } from "./helpers";
import type { User } from "@prisma/client";

// FacultyResource routes authenticate via the web NextAuth session
// (src/lib/session.ts -> auth()), not the mobile Bearer JWT — same pattern
// as tests/csv-export.test.ts. `currentSessionUser` is reassigned between
// test cases so this one mock can stand in for different actors (two
// different faculty members, or none at all for "not logged in").
let currentSessionUser: { id: string; tenantId: string; role: string } | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (currentSessionUser ? { user: currentSessionUser } : null),
}));

function tinyPdfFormData(fields: Record<string, string>, filename = "slides.pdf"): FormData {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%test\n");
  const file = new File([bytes], filename, { type: "application/pdf" });
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const BASE = "http://localhost/api";

describe("FacultyResource permissions (faculty custom per-student uploads)", () => {
  let faculty: User;
  let facultyStudentProfileId: string; // student actually linked to `faculty` via CS301
  let facultyCourseCode: string;
  let unlinkedStudentProfileId: string; // a student `faculty` has NO FacultyCourseLink to at all
  let otherStudentUser: User; // logs in as this "other" student for the isolation test
  let secondFaculty: User; // a second, unrelated faculty member

  beforeAll(async () => {
    const facultyUser = await prisma.user.findFirst({ where: { email: "faculty@demo.shadow.sa" } });
    if (!facultyUser) throw new Error("Seed the demo faculty user before running this test.");
    faculty = facultyUser;

    const link = await prisma.facultyCourseLink.findFirst({
      where: { facultyUserId: faculty.id },
    });
    if (!link) throw new Error("Seed a FacultyCourseLink for the demo faculty before running this test.");
    facultyStudentProfileId = link.studentProfileId;
    facultyCourseCode = link.courseCode;

    // A brand-new student profile with ZERO FacultyCourseLink to `faculty` —
    // the clean "not in their course" fixture.
    const unlinkedEmail = `unlinked-student-${randomUUID()}@demo.shadow.sa`;
    otherStudentUser = await prisma.user.create({
      data: {
        tenantId: faculty.tenantId,
        email: unlinkedEmail,
        passwordHash: "not-used-in-this-test",
        role: "student",
        active: true,
      },
    });
    const unlinkedProfile = await prisma.studentProfile.create({
      data: {
        tenantId: faculty.tenantId,
        userId: otherStudentUser.id,
        studentNumber: "999999999",
        major: "test",
        academicStage: "test",
        phone: "0500000000",
        requestStatus: "approved",
        verified: true,
      },
    });
    unlinkedStudentProfileId = unlinkedProfile.id;

    secondFaculty = await prisma.user.create({
      data: {
        tenantId: faculty.tenantId,
        email: `second-faculty-${randomUUID()}@demo.shadow.sa`,
        passwordHash: "not-used-in-this-test",
        role: "faculty",
        active: true,
      },
    });
  });

  it("(a) a faculty member CANNOT upload a resource for a student not in their course -> 403", async () => {
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const { POST } = await import("@/app/api/faculty/resources/route");

    const res = await POST(
      new Request(`${BASE}/faculty/resources`, {
        method: "POST",
        body: tinyPdfFormData({
          studentProfileId: unlinkedStudentProfileId,
          courseCode: "SOME_COURSE_NOT_LINKED",
          title: "should not be created",
        }),
      })
    );

    expect(res.status).toBe(403);
    const count = await prisma.facultyResource.count({ where: { studentProfileId: unlinkedStudentProfileId } });
    expect(count).toBe(0);
  });

  it("control case: the SAME faculty member CAN upload for a student actually in their course -> 201", async () => {
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const { POST } = await import("@/app/api/faculty/resources/route");

    const res = await POST(
      new Request(`${BASE}/faculty/resources`, {
        method: "POST",
        body: tinyPdfFormData({
          studentProfileId: facultyStudentProfileId,
          courseCode: facultyCourseCode,
          title: "شرائح مبسطة",
        }),
      })
    );

    expect(res.status).toBe(201);
  });

  it("(b) a student cannot see another student's FacultyResource rows via the mobile API", async () => {
    // `otherStudentUser` (the unlinked fixture student) has zero resources.
    // `facultyStudentProfileId`'s owner DOES have one now (from the control
    // case above). Log in as the OTHER student and confirm their own list
    // is empty and contains nothing belonging to the first student.
    const otherStudentToken = await tokenFor(otherStudentUser.email);
    const { GET: listResources } = await import("@/app/api/student/faculty-resources/route");

    const res = await listResources(authedRequest(`${BASE}/student/faculty-resources`, otherStudentToken.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resources).toEqual([]);

    // And directly attempting to download the FIRST student's resource by
    // id, authenticated as the second student, must 404 — never confirm it
    // exists or belongs to someone else.
    const facultyStudentResource = await prisma.facultyResource.findFirst({
      where: { studentProfileId: facultyStudentProfileId },
    });
    expect(facultyStudentResource).not.toBeNull();

    const { GET: downloadResource } = await import("@/app/api/student/faculty-resources/[id]/download/route");
    const downloadRes = await downloadResource(
      authedRequest(`${BASE}/student/faculty-resources/${facultyStudentResource!.id}/download`, otherStudentToken.token),
      { params: Promise.resolve({ id: facultyStudentResource!.id }) }
    );
    expect(downloadRes.status).toBe(404);
  });

  it("(c) no route lets an unrelated faculty member or admin enumerate 'which students have files'", async () => {
    const { GET: listForFaculty } = await import("@/app/api/faculty/resources/route");

    // An unrelated second faculty member, even with a syntactically valid
    // studentProfileId + courseCode for someone ELSE's linked student, is
    // rejected — they have no FacultyCourseLink of their own to that pair.
    currentSessionUser = { id: secondFaculty.id, tenantId: secondFaculty.tenantId, role: "faculty" };
    const resUnrelatedFaculty = await listForFaculty(
      new Request(
        `${BASE}/faculty/resources?studentProfileId=${facultyStudentProfileId}&courseCode=${facultyCourseCode}`
      )
    );
    expect(resUnrelatedFaculty.status).toBe(403);

    // There is no "list all students with resources" mode: omitting the
    // required studentProfileId/courseCode query params is rejected
    // outright (400), not silently defaulted to "everything".
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const resNoParams = await listForFaculty(new Request(`${BASE}/faculty/resources`));
    expect(resNoParams.status).toBe(400);

    // Admin has NO access path to this table in this phase at all — not
    // even read, unlike every other admin-bypasses-role-checks pattern
    // elsewhere in this codebase.
    const admin = await prisma.user.findFirst({ where: { email: "admin@demo.shadow.sa" } });
    expect(admin).not.toBeNull();
    currentSessionUser = { id: admin!.id, tenantId: admin!.tenantId, role: "admin" };
    const resAdmin = await listForFaculty(
      new Request(
        `${BASE}/faculty/resources?studentProfileId=${facultyStudentProfileId}&courseCode=${facultyCourseCode}`
      )
    );
    expect(resAdmin.status).toBe(403);
  });

  it("AuditLog records the upload with the correct action and target student", async () => {
    const [row] = await prisma.auditLog.findMany({
      where: { action: "upload_faculty_resource", targetStudentProfileId: facultyStudentProfileId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(row).toBeTruthy();
    expect(row.actorUserId).toBe(faculty.id);
  });
});
