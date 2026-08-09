import { getTenantScopedPrisma } from "./tenant-db";
import type { RequestContext } from "./session";

/**
 * Thrown when a faculty member tries to touch a student/course combination
 * they have no real link to. Callers (API routes) catch this and respond
 * 403 — unlike assertSpecialistAssigned's notFound() (a page-render-only
 * API), FacultyResource access is driven entirely through API routes
 * (upload/list/download/delete all go through fetch from the /faculty/students
 * modal), so a catchable error that maps cleanly to a JSON 403 response
 * fits this call pattern better than a page-navigation 404.
 */
export class FacultyAccessError extends Error {
  constructor(message = "لا تملك صلاحية الوصول لهذا الطالب في هذا المقرر") {
    super(message);
    this.name = "FacultyAccessError";
  }
}

/**
 * Enforces the core faculty-resource visibility rule: a faculty member may
 * only act on a student if there is an actual FacultyCourseLink between
 * this exact faculty member, this exact student, AND this exact course
 * code — not just any course link between the two. Admins do NOT bypass
 * this (this phase gives admin no access path to FacultyResource at all,
 * unlike every other admin-bypasses-role-checks pattern elsewhere in this
 * codebase — see the report for why).
 */
export async function assertFacultyLinkedToStudent(
  ctx: RequestContext,
  studentProfileId: string,
  courseCode: string
): Promise<void> {
  const db = getTenantScopedPrisma(ctx.tenantId);
  const link = await db.facultyCourseLink.findFirst({
    where: {
      facultyUserId: ctx.userId,
      studentProfileId,
      courseCode,
    },
  });

  if (!link) {
    throw new FacultyAccessError();
  }
}
