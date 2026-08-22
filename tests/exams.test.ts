import "./setup";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest, assertNoRawClassificationLeak } from "./helpers";
import type { User } from "@prisma/client";

// Exam creation/management routes authenticate via the web NextAuth
// session (src/lib/session.ts -> auth()), same pattern as
// tests/faculty-resources.test.ts. The student-facing mobile routes
// (GET /api/exams/:id/questions, POST /api/exams/:id/answers) use the
// mobile Bearer JWT instead, exercised via tokenFor/authedRequest.
let currentSessionUser: { id: string; tenantId: string; role: string } | null = null;

vi.mock("@/auth", () => ({
  auth: async () => (currentSessionUser ? { user: currentSessionUser } : null),
}));

const BASE = "http://localhost/api";

describe("Exam permissions (voice-driven exam-taking, MCQ Phase 1)", () => {
  let faculty: User; // seeded faculty@demo.shadow.sa, linked to CS301
  let facultyCourseCode: string;
  let secondFaculty: User; // unrelated faculty member, no link to CS301
  let enrolledStudent: User; // seeded student@demo.shadow.sa, linked to faculty's CS301
  let unenrolledStudent: User; // brand-new student, zero FacultyCourseLink at all

  let manualExamId: string;

  beforeAll(async () => {
    const facultyUser = await prisma.user.findFirst({ where: { email: "faculty@demo.shadow.sa" } });
    if (!facultyUser) throw new Error("Seed the demo faculty user before running this test.");
    faculty = facultyUser;

    const studentUser = await prisma.user.findFirst({ where: { email: "student@demo.shadow.sa" } });
    if (!studentUser) throw new Error("Seed the demo student user before running this test.");
    enrolledStudent = studentUser;

    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId: studentUser.id } });
    if (!studentProfile) throw new Error("Seed a StudentProfile for the demo student before running this test.");

    // Must be a link for THIS specific student, not just any link this
    // faculty member has (the seed also links faculty@demo.shadow.sa to a
    // different student under BUS101) — otherwise the enrolled-student
    // assertions in this suite would flake depending on row order.
    const link = await prisma.facultyCourseLink.findFirst({
      where: { facultyUserId: faculty.id, studentProfileId: studentProfile.id },
    });
    if (!link) throw new Error("Seed a FacultyCourseLink between the demo faculty and demo student before running this test.");
    facultyCourseCode = link.courseCode;

    secondFaculty = await prisma.user.create({
      data: {
        tenantId: faculty.tenantId,
        email: `second-faculty-${randomUUID()}@demo.shadow.sa`,
        fullName: "عضو هيئة تدريس اختباري ثانٍ",
        passwordHash: "not-used-in-this-test",
        role: "faculty",
        active: true,
      },
    });

    const unenrolledEmail = `unenrolled-student-${randomUUID()}@demo.shadow.sa`;
    unenrolledStudent = await prisma.user.create({
      data: {
        tenantId: faculty.tenantId,
        email: unenrolledEmail,
        fullName: "طالب اختبار غير مسجل",
        passwordHash: "not-used-in-this-test",
        role: "student",
        active: true,
      },
    });
    // Deliberately NO StudentProfile / FacultyCourseLink created for this
    // user — assertStudentEnrolledInCourse should fail closed either way
    // (no profile at all, or a profile with no link), but the "not
    // enrolled in this course" case is the one this suite targets.
    await prisma.studentProfile.create({
      data: {
        tenantId: faculty.tenantId,
        userId: unenrolledStudent.id,
        studentNumber: "888888888",
        major: "test",
        academicStage: "test",
        phone: "0500000001",
        requestStatus: "approved",
        verified: true,
      },
    });
  });

  afterAll(async () => {
    // Cleanup: exams created by `faculty` in this suite, then the
    // throwaway users. Question/QuestionOption/ExamSubmission/Answer rows
    // cascade-delete with their parent Exam/User (schema onDelete: Cascade).
    await prisma.exam.deleteMany({ where: { facultyUserId: faculty.id, title: { startsWith: "TEST_EXAM_" } } });
    for (const id of [secondFaculty?.id, unenrolledStudent?.id]) {
      if (!id) continue;
      await prisma.user.delete({ where: { id } }).catch(() => undefined);
    }
  });

  it("faculty can create a manual exam for a course they actually teach -> 201", async () => {
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const { POST } = await import("@/app/api/faculty/exams/route");

    const res = await POST(
      new Request(`${BASE}/faculty/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "TEST_EXAM_manual",
          courseCode: facultyCourseCode,
          source: "MANUAL",
          availableAt: new Date(Date.now() - 1000).toISOString(), // published (past)
          questions: [
            {
              text: "2 + 2 = ?",
              options: [
                { text: "3", isCorrect: false },
                { text: "4", isCorrect: true },
                { text: "5", isCorrect: false },
                { text: "22", isCorrect: false },
              ],
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    manualExamId = body.examId;
    expect(manualExamId).toBeTruthy();
  });

  it("faculty CANNOT create an exam for a course they don't teach -> 403, nothing persisted", async () => {
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const { POST } = await import("@/app/api/faculty/exams/route");

    const res = await POST(
      new Request(`${BASE}/faculty/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "TEST_EXAM_should_not_exist",
          courseCode: "SOME_COURSE_NOT_TAUGHT_BY_FACULTY",
          source: "MANUAL",
          questions: [{ text: "q", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }],
        }),
      })
    );

    expect(res.status).toBe(403);
    const count = await prisma.exam.count({ where: { title: "TEST_EXAM_should_not_exist" } });
    expect(count).toBe(0);
  });

  it("a DIFFERENT faculty member cannot view another faculty's exam via GET /api/faculty/exams/:id -> 404", async () => {
    currentSessionUser = { id: secondFaculty.id, tenantId: secondFaculty.tenantId, role: "faculty" };
    const { GET } = await import("@/app/api/faculty/exams/[id]/route");

    const res = await GET(new Request(`${BASE}/faculty/exams/${manualExamId}`), {
      params: Promise.resolve({ id: manualExamId }),
    });

    expect(res.status).toBe(404);
  });

  it("a DIFFERENT faculty member's own exam list never includes the first faculty's exam", async () => {
    currentSessionUser = { id: secondFaculty.id, tenantId: secondFaculty.tenantId, role: "faculty" };
    const { GET: listExams } = await import("@/app/api/faculty/exams/route");

    const res = await listExams();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exams.some((e: { id: string }) => e.id === manualExamId)).toBe(false);
  });

  it("admin has NO read access to exam data via the faculty exam routes", async () => {
    const admin = await prisma.user.findFirst({ where: { email: "admin@demo.shadow.sa" } });
    expect(admin).not.toBeNull();
    currentSessionUser = { id: admin!.id, tenantId: admin!.tenantId, role: "admin" };
    const { GET } = await import("@/app/api/faculty/exams/[id]/route");

    const res = await GET(new Request(`${BASE}/faculty/exams/${manualExamId}`), {
      params: Promise.resolve({ id: manualExamId }),
    });

    // requireRole("faculty") rejects admin outright (no admin-bypass for
    // this feature) -> 403, never even reaching the ownership check.
    expect(res.status).toBe(403);
  });

  it("GET /api/exams/:id/questions never returns isCorrect anywhere in the body", async () => {
    const studentToken = await tokenFor(enrolledStudent.email);
    const { GET } = await import("@/app/api/exams/[id]/questions/route");

    const res = await GET(authedRequest(`${BASE}/exams/${manualExamId}/questions`, studentToken.token), {
      params: Promise.resolve({ id: manualExamId }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("isCorrect");

    // Also confirm the response doesn't leak the platform's separate
    // classification-withholding fields, reusing the shared test helper —
    // establishes this endpoint follows the same withholding discipline as
    // the rest of the student-facing API even though the fields being
    // checked here (isCorrect) are exam-specific, not classification-specific.
    assertNoRawClassificationLeak(body);

    expect(body.exam.questions[0].options[0]).not.toHaveProperty("isCorrect");
  });

  it("a student NOT enrolled in the exam's course gets 404 from GET /api/exams/:id/questions", async () => {
    const outsiderToken = await tokenFor(unenrolledStudent.email);
    const { GET } = await import("@/app/api/exams/[id]/questions/route");

    const res = await GET(authedRequest(`${BASE}/exams/${manualExamId}/questions`, outsiderToken.token), {
      params: Promise.resolve({ id: manualExamId }),
    });

    expect(res.status).toBe(404);
  });

  it("a student NOT enrolled in the exam's course CANNOT submit an answer -> 404, no Answer/ExamSubmission created", async () => {
    const outsiderToken = await tokenFor(unenrolledStudent.email);
    const { GET: getQuestions } = await import("@/app/api/exams/[id]/questions/route");

    // Fetch the real question/option ids as the ENROLLED student first (a
    // legitimate way to know them), then attempt to submit as the outsider.
    const enrolledToken = await tokenFor(enrolledStudent.email);
    const qRes = await getQuestions(authedRequest(`${BASE}/exams/${manualExamId}/questions`, enrolledToken.token), {
      params: Promise.resolve({ id: manualExamId }),
    });
    const qBody = await qRes.json();
    const questionId = qBody.exam.questions[0].id;
    const selectedOptionId = qBody.exam.questions[0].options[0].id;

    const { POST: postAnswer } = await import("@/app/api/exams/[id]/answers/route");
    const form = new FormData();
    form.set("questionId", questionId);
    form.set("selectedOptionId", selectedOptionId);

    const res = await postAnswer(
      authedRequest(`${BASE}/exams/${manualExamId}/answers`, outsiderToken.token, { method: "POST", body: form }),
      { params: Promise.resolve({ id: manualExamId }) }
    );

    expect(res.status).toBe(404);
    const submission = await prisma.examSubmission.findFirst({
      where: { examId: manualExamId, studentUserId: unenrolledStudent.id },
    });
    expect(submission).toBeNull();
  });

  it("an ENROLLED student CAN submit an answer -> 201, ExamSubmission created lazily, AuditLog written", async () => {
    const enrolledToken = await tokenFor(enrolledStudent.email);
    const { GET: getQuestions } = await import("@/app/api/exams/[id]/questions/route");
    const qRes = await getQuestions(authedRequest(`${BASE}/exams/${manualExamId}/questions`, enrolledToken.token), {
      params: Promise.resolve({ id: manualExamId }),
    });
    const qBody = await qRes.json();
    const questionId = qBody.exam.questions[0].id;
    const selectedOptionId = qBody.exam.questions[0].options[1].id;

    const { POST: postAnswer } = await import("@/app/api/exams/[id]/answers/route");
    const form = new FormData();
    form.set("questionId", questionId);
    form.set("selectedOptionId", selectedOptionId);

    const res = await postAnswer(
      authedRequest(`${BASE}/exams/${manualExamId}/answers`, enrolledToken.token, { method: "POST", body: form }),
      { params: Promise.resolve({ id: manualExamId }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const submission = await prisma.examSubmission.findUnique({
      where: { examId_studentUserId: { examId: manualExamId, studentUserId: enrolledStudent.id } },
    });
    expect(submission).not.toBeNull();
    // manualExamId has exactly one question (see the "faculty can create a
    // manual exam..." fixture above) — answering it answers every question
    // in the exam, so the submission auto-completes on this same call
    // (see POST /api/exams/:id/answers's post-upsert completion check).
    expect(submission!.status).toBe("completed");
    expect(submission!.completedAt).not.toBeNull();

    const [auditRow] = await prisma.auditLog.findMany({
      where: { action: "submit_exam_answer", actorUserId: enrolledStudent.id },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(auditRow).toBeTruthy();
  });

  it("a draft (unpublished) exam is invisible to an enrolled student -> 404", async () => {
    currentSessionUser = { id: faculty.id, tenantId: faculty.tenantId, role: "faculty" };
    const { POST: createExam } = await import("@/app/api/faculty/exams/route");
    const createRes = await createExam(
      new Request(`${BASE}/faculty/exams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "TEST_EXAM_draft",
          courseCode: facultyCourseCode,
          source: "MANUAL",
          // no availableAt -> stays a draft
          questions: [{ text: "q", options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] }],
        }),
      })
    );
    const { examId: draftExamId } = await createRes.json();

    const enrolledToken = await tokenFor(enrolledStudent.email);
    const { GET } = await import("@/app/api/exams/[id]/questions/route");
    const res = await GET(authedRequest(`${BASE}/exams/${draftExamId}/questions`, enrolledToken.token), {
      params: Promise.resolve({ id: draftExamId }),
    });

    expect(res.status).toBe(404);
  });
});
