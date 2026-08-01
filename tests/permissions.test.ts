import "./setup";
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { tokenFor, authedRequest } from "./helpers";
import { GET as getDocument } from "@/app/api/documents/[id]/route";
import { POST as uploadDocument } from "@/app/api/documents/upload/route";
import { GET as getStudentProfile } from "@/app/api/student/profile/route";
import { GET as getSupportPlan } from "@/app/api/student/support-plan/route";

const BASE = "http://localhost/api";

function tinyPdfFormData(filename = "test.pdf"): FormData {
  const bytes = new TextEncoder().encode("%PDF-1.4\n%test\n");
  const file = new File([bytes], filename, { type: "application/pdf" });
  const form = new FormData();
  form.set("file", file);
  return form;
}

describe("permission and tenant/role isolation (Phase 2 required suite)", () => {
  let student1: Awaited<ReturnType<typeof tokenFor>>; // assigned to the demo specialist
  let student2: Awaited<ReturnType<typeof tokenFor>>; // NOT assigned to the demo specialist
  let specialist: Awaited<ReturnType<typeof tokenFor>>;
  let faculty: Awaited<ReturnType<typeof tokenFor>>;

  let student1DocumentId: string;
  let student2DocumentId: string;

  beforeAll(async () => {
    student1 = await tokenFor("student@demo.shadow.sa");
    student2 = await tokenFor("student2@demo.shadow.sa");
    specialist = await tokenFor("specialist@demo.shadow.sa");
    faculty = await tokenFor("faculty@demo.shadow.sa");

    // Enforce (not just assert) the fixture this whole suite depends on: the
    // demo specialist must be assigned to student1 and NOT to student2. Made
    // idempotent/self-healing rather than a bare assertion, so this suite
    // doesn't depend on exactly which manual testing happened against the
    // shared local dev database before it runs.
    const student1ProfileId = await studentProfileId(student1.user.id);
    const student2ProfileId = await studentProfileId(student2.user.id);

    await prisma.specialistAssignment.upsert({
      where: {
        specialistUserId_studentProfileId: { specialistUserId: specialist.user.id, studentProfileId: student1ProfileId },
      },
      update: {},
      create: {
        tenantId: specialist.user.tenantId,
        specialistUserId: specialist.user.id,
        studentProfileId: student1ProfileId,
        assignedByUserId: specialist.user.id,
      },
    });
    await prisma.specialistAssignment.deleteMany({
      where: { specialistUserId: specialist.user.id, studentProfileId: student2ProfileId },
    });

    // Upload one real document per student through the real upload route so
    // this suite exercises actual encrypt -> MinIO -> Document-row flow,
    // not just permission checks on pre-seeded metadata.
    const upload1 = await uploadDocument(
      authedRequest(`${BASE}/documents/upload`, student1.token, { method: "POST", body: tinyPdfFormData() })
    );
    expect(upload1.status).toBe(201);
    student1DocumentId = (await upload1.json()).documentId;

    const upload2 = await uploadDocument(
      authedRequest(`${BASE}/documents/upload`, student2.token, { method: "POST", body: tinyPdfFormData() })
    );
    expect(upload2.status).toBe(201);
    student2DocumentId = (await upload2.json()).documentId;
  });

  async function studentProfileId(userId: string): Promise<string> {
    const profile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) throw new Error(`No StudentProfile for user ${userId}`);
    return profile.id;
  }

  it("a specialist CAN open a document for a student assigned to them (control case)", async () => {
    const res = await getDocument(authedRequest(`${BASE}/documents/${student1DocumentId}`, specialist.token), {
      params: Promise.resolve({ id: student1DocumentId }),
    });
    expect(res.status).toBe(200);
  });

  it("a specialist CANNOT open a document for a student NOT assigned to them -> 403", async () => {
    const res = await getDocument(authedRequest(`${BASE}/documents/${student2DocumentId}`, specialist.token), {
      params: Promise.resolve({ id: student2DocumentId }),
    });
    expect(res.status).toBe(403);
  });

  it("faculty cannot hit the document endpoint at all -> 403", async () => {
    const res = await getDocument(authedRequest(`${BASE}/documents/${student1DocumentId}`, faculty.token), {
      params: Promise.resolve({ id: student1DocumentId }),
    });
    expect(res.status).toBe(403);
  });

  it("an unauthenticated request to the document endpoint -> 401", async () => {
    const res = await getDocument(new Request(`${BASE}/documents/${student1DocumentId}`), {
      params: Promise.resolve({ id: student1DocumentId }),
    });
    expect(res.status).toBe(401);
  });

  it("a student can never reach category or supportLevel via /api/student/profile", async () => {
    const res = await getStudentProfile(authedRequest(`${BASE}/student/profile`, student1.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toMatch(/categor|supportlevel|condition/);
    expect(body).not.toHaveProperty("category");
    expect(body).not.toHaveProperty("supportLevel");
    expect(body).not.toHaveProperty("conditionId");
    // enabledTools must still be present — the endpoint isn't just empty.
    expect(Array.isArray(body.enabledTools)).toBe(true);
  });

  it("a student can never reach category or supportLevel via /api/student/support-plan", async () => {
    const res = await getSupportPlan(authedRequest(`${BASE}/student/support-plan`, student1.token));
    expect(res.status).toBe(200);
    const body = await res.json();
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toMatch(/categor|supportlevel|condition/);
  });

  it("AuditLog records every document access attempt — successful AND denied", async () => {
    const [successRow] = await prisma.auditLog.findMany({
      where: {
        action: "view_document",
        resourceId: student1DocumentId,
        actorUserId: specialist.user.id,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(successRow, "expected a view_document row for the successful download").toBeTruthy();

    const [deniedRow] = await prisma.auditLog.findMany({
      where: {
        action: "view_document_denied",
        resourceId: student2DocumentId,
        actorUserId: specialist.user.id,
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(deniedRow, "expected a view_document_denied row for the unassigned-student attempt").toBeTruthy();
    expect(deniedRow.targetStudentProfileId).toBe(await studentProfileId(student2.user.id));
  });
});
