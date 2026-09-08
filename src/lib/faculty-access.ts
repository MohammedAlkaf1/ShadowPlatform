import { getTranslations } from "next-intl/server";
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
  constructor(message: string) {
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
    const tErrors = await getTranslations("Common.errors");
    throw new FacultyAccessError(tErrors("notAuthorizedStudentCourse"));
  }
}

/**
 * Course-level variant of assertFacultyLinkedToStudent, for the exam
 * feature: creating/editing an Exam isn't about one specific student, it's
 * about "does this faculty member actually teach this courseCode at all" —
 * proven the same way the rest of this codebase proves any faculty/course
 * relationship, by requiring at least one real FacultyCourseLink row for
 * this faculty member in this course (to ANY student). Deliberately reuses
 * FacultyAccessError/the same 403-mapping convention as the per-student
 * check above, rather than inventing a parallel error type.
 */
export async function assertFacultyTeachesCourse(ctx: RequestContext, courseCode: string): Promise<void> {
  const db = getTenantScopedPrisma(ctx.tenantId);
  const link = await db.facultyCourseLink.findFirst({
    where: {
      facultyUserId: ctx.userId,
      courseCode,
    },
  });

  if (!link) {
    const tErrors = await getTranslations("Common.errors");
    throw new FacultyAccessError(tErrors("notAuthorizedStudentCourse"));
  }
}

/**
 * Student-side equivalent for the exam feature: is the calling student
 * actually enrolled in `courseCode` under `facultyUserId`? Same
 * FacultyCourseLink table, same "an actual link row must exist" rule as
 * assertFacultyLinkedToStudent, just checked from the student's side (by
 * studentProfileId, not by a specific student id the faculty is asserting
 * about).
 */
export async function assertStudentEnrolledInCourse(
  ctx: RequestContext,
  facultyUserId: string,
  courseCode: string
): Promise<void> {
  const db = getTenantScopedPrisma(ctx.tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId: ctx.userId } });
  if (!studentProfile) {
    const tErrors = await getTranslations("Common.errors");
    throw new FacultyAccessError(tErrors("studentProfileNotFound"));
  }

  const link = await db.facultyCourseLink.findFirst({
    where: {
      facultyUserId,
      studentProfileId: studentProfile.id,
      courseCode,
    },
  });

  if (!link) {
    const tErrors = await getTranslations("Common.errors");
    throw new FacultyAccessError(tErrors("notAuthorizedStudentCourse"));
  }
}
