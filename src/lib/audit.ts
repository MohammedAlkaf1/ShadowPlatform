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
  | "acknowledge_alert";

export interface AuditLogInput {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  targetStudentProfileId?: string | null;
  ipAddress?: string | null;
}

/**
 * Single write path for AuditLog rows. Every document/assessment/plan read
 * or mutation that touches a student's record MUST go through this helper —
 * per PDPL this is non-negotiable. Never include sensitive content
 * (diagnosis text, notes, file contents) in `action`/`resourceType` — those
 * are short machine-readable labels only.
 */
export async function logAudit(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      targetStudentProfileId: input.targetStudentProfileId ?? null,
      ipAddress: input.ipAddress ?? null,
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
