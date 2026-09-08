import { randomUUID, createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "./prisma";

export type AuditAction =
  | "upload_document"
  | "view_document"
  | "delete_document"
  | "view_assessment"
  | "create_assessment"
  | "update_assessment"
  | "view_support_plan"
  | "create_support_plan"
  | "approve_support_plan"
  | "revise_support_plan"
  | "view_student_profile"
  | "update_student_profile"
  | "soft_delete_student"
  | "create_user"
  | "update_user"
  | "assign_specialist"
  | "view_usage_events"
  | "acknowledge_alert"
  | "resolve_alert"
  | "view_audit_log"
  | "export_report"
  | "view_document_denied"
  | "review_document"
  | "upload_faculty_resource"
  | "view_faculty_resource"
  | "delete_faculty_resource"
  // Batch 3: specialist review screen — "أعدها للطالب" (return to
  // student). See specialist/students/[id]/review/actions.ts for why this
  // sets RequestStatus.rejected rather than any SupportPlan field.
  | "return_request_to_student"
  // Voice-driven exam-taking (MCQ, Phase 1) — see prisma/schema.prisma's
  // Exam model comment and src/lib/ai.ts for the scoped AI exception.
  | "create_exam"
  | "generate_exam_ai"
  | "publish_exam"
  | "submit_exam_answer"
  // Lecture keyterm glossary (speech-to-text boosting) — see
  // prisma/schema.prisma's LectureKeyterm model comment and src/lib/ai.ts.
  | "extract_lecture_keywords_ai"
  | "approve_lecture_keyterms"
  | "delete_lecture_keyterm"
  // "Sign out everywhere" — see mobile-jwt.ts's tokenVersion doc comment.
  | "logout_all_devices";

export interface AuditLogInput {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  targetStudentProfileId?: string | null;
  ipAddress?: string | null;
  // Both optional — callers that already resolved a RequestContext can pass
  // ctx.userSessionId; everyone else gets it filled in below via headers()/
  // auth(), which work from any Server Component, Server Action, or Route
  // Handler in this Next.js version.
  userAgent?: string | null;
  sessionId?: string | null;
}

/**
 * Single write path for AuditLog rows. Every document/assessment/plan read
 * or mutation that touches a student's record MUST go through this helper —
 * per PDPL this is non-negotiable. Never include sensitive content
 * (diagnosis text, notes, file contents) in `action`/`resourceType` — those
 * are short machine-readable labels only.
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  let ipAddress = input.ipAddress ?? null;
  let userAgent = input.userAgent ?? null;
  let sessionId = input.sessionId ?? null;

  if (ipAddress === null || userAgent === null || sessionId === null) {
    try {
      const headerStore = await headers();
      if (ipAddress === null) {
        const forwardedFor = headerStore.get("x-forwarded-for");
        ipAddress = forwardedFor ? (forwardedFor.split(",")[0]?.trim() ?? null) : headerStore.get("x-real-ip");
      }
      if (userAgent === null) userAgent = headerStore.get("user-agent");
    } catch {
      // Called outside a request-scoped context (shouldn't happen for any
      // real call site today) — leave these null rather than throwing, the
      // audit write itself must never fail because of missing metadata.
    }
    if (sessionId === null) {
      try {
        const { auth } = await import("@/auth");
        const session = await auth();
        sessionId = session?.user?.sessionId ?? null;
      } catch {
        // Same fail-open reasoning as above.
      }
    }
  }

  const id = randomUUID();
  const createdAt = new Date();
  const logHash = createHash("sha256")
    .update(
      [id, input.tenantId, input.actorUserId, input.action, input.resourceType, input.resourceId ?? "", createdAt.toISOString()].join(
        "|"
      )
    )
    .digest("hex");

  await prisma.auditLog.create({
    data: {
      id,
      createdAt,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      targetStudentProfileId: input.targetStudentProfileId ?? null,
      ipAddress,
      userAgent,
      sessionId,
      logHash,
    },
  });
}

/**
 * Returns audit log rows visible to `actorUserId`. A specialist (or any
 * non-admin) may only ever see their OWN actions — enforced here in the
 * query layer, not left to the UI to filter, so a future page can't
 * accidentally leak everyone's audit trail.
 */
export async function getVisibleAuditLogs(params: {
  tenantId: string;
  requestingUserId: string;
  requestingUserRole: "student" | "faculty" | "specialist" | "admin";
  targetStudentProfileId?: string;
  take?: number;
}) {
  const { tenantId, requestingUserId, requestingUserRole, targetStudentProfileId, take = 100 } = params;

  const where: {
    tenantId: string;
    actorUserId?: string;
    targetStudentProfileId?: string;
  } = { tenantId };

  if (requestingUserRole !== "admin") {
    // Non-admins only ever see rows where THEY are the actor.
    where.actorUserId = requestingUserId;
  }

  if (targetStudentProfileId) {
    where.targetStudentProfileId = targetStudentProfileId;
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
}

/** Best-effort extraction of the caller's IP from a Next.js Request. */
export function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}
