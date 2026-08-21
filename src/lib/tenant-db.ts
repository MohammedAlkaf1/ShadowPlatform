import { prisma } from "./prisma";

/**
 * Tenant-scoping pattern
 * ──────────────────────
 * Every domain query in this app MUST go through `getTenantScopedPrisma(tenantId)`
 * instead of the raw `prisma` client. This wraps the base client in a Prisma
 * Client Extension that automatically injects `tenantId` into the `where`
 * clause of every read/update/delete, and into the `data` of every create,
 * for all tenant-scoped models. This is Prisma's closest equivalent to
 * Postgres row-level security given the current tooling — enforced in the
 * query layer, not left to each call site to remember.
 *
 * `tenantId` must always come from the authenticated session (see
 * src/lib/session.ts), never from client-supplied input — middleware.ts and
 * every server component/route handler resolve it that way.
 *
 * Models intentionally NOT in this list because they don't carry a
 * tenantId column directly (they scope transitively through their parent):
 *   - ToolActivation    (scopes via SupportPlan.tenantId)
 *   - PlanRevision      (scopes via SupportPlan.tenantId)
 *   - Question          (scopes via Exam.tenantId)
 *   - QuestionOption    (scopes via Question -> Exam.tenantId)
 *   - Answer            (scopes via ExamSubmission.tenantId)
 * Any query against those must join through/verify the parent's tenantId
 * explicitly.
 */
const TENANT_SCOPED_MODELS = new Set<string>([
  "User",
  "StudentProfile",
  "Category",
  "Condition",
  "SupportLevel",
  "Document",
  "Assessment",
  "SupportPlan",
  "UsageEvent",
  "MentorAlert",
  "FacultyCourseLink",
  "AuditLog",
  "SpecialistAssignment",
  "Exam",
  "ExamSubmission",
]);

const WHERE_SCOPED_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

export function getTenantScopedPrisma(tenantId: string) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new Error("getTenantScopedPrisma: a valid tenantId is required");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            args.where = { ...(args.where ?? {}), tenantId };
          } else if (operation === "create") {
            args.data = { tenantId, ...(args.data ?? {}) };
            if (!args.data.tenantId) args.data.tenantId = tenantId;
          } else if (operation === "createMany") {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((row: Record<string, unknown>) => ({
                tenantId,
                ...row,
              }));
            }
          } else if (operation === "upsert") {
            args.where = { ...(args.where ?? {}), tenantId };
            args.create = { tenantId, ...(args.create ?? {}) };
          }

          return query(args);
        },
      },
    },
  });
}

export type ScopedPrisma = ReturnType<typeof getTenantScopedPrisma>;
