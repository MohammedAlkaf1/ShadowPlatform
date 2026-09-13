import { NextResponse } from "next/server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeStudentAiFeature } from "@/lib/student-ai-context";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import {
  createDeafModeSession,
  activeSessionCountForUser,
  MAX_CONCURRENT_SESSIONS_PER_USER,
  ALLOWED_DEAF_MODE_LANGUAGES,
  type DeafModeLanguage,
} from "@/lib/deaf-mode-session";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  language: z.enum(["ar", "en-US"]),
  courseCode: z.string().trim().min(1).max(64).optional(),
});

/**
 * Rate limit: 10 session-starts per 10-minute window per student — same
 * value as the retired server/ws-transcribe.js's connection-attempt limit,
 * since the underlying cost/abuse shape is identical (one long-lived
 * Deepgram session per successful start).
 */
const START_RATE_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

/**
 * POST /api/student/ai/deaf-mode/start — JSON body { language, courseCode? }.
 *
 * Opens a server-side Deepgram WebSocket (this process is the only thing
 * that ever holds DEEPGRAM_API_KEY) and returns an opaque sessionId the
 * client uses for POST .../audio and GET .../stream. Course keyterms are
 * resolved server-side from the student's own real course enrollment,
 * mirroring GET /api/courses/[courseCode]/keyterms's exact authorization
 * shape — never trusted from the client.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const rateLimit = checkRateLimit(`deaf-mode-start:${ctx.userId}`, START_RATE_LIMIT);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: tErrors("tooManyRequests") },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

  if (activeSessionCountForUser(ctx.userId) >= MAX_CONCURRENT_SESSIONS_PER_USER) {
    return NextResponse.json({ error: tErrors("tooManyRequests") }, { status: 429 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }
  if (!ALLOWED_DEAF_MODE_LANGUAGES.has(parsed.data.language)) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const aiContext = await authorizeStudentAiFeature(ctx.tenantId, ctx.userId, "DEAF_MODE");
  if (!aiContext) {
    return NextResponse.json({ error: tErrors("notAuthorizedForAiFeature") }, { status: 403 });
  }

  let keyterms: string[] = [];
  if (parsed.data.courseCode) {
    const resolved = await resolveApprovedKeyterms(ctx.tenantId, ctx.userId, parsed.data.courseCode);
    if (resolved === null) {
      return NextResponse.json({ error: tErrors("courseNotFound") }, { status: 403 });
    }
    keyterms = resolved;
  }

  const language: DeafModeLanguage = parsed.data.language;
  const session = await createDeafModeSession(ctx.userId, ctx.tenantId, language, keyterms);
  if (!session) {
    return NextResponse.json({ error: tErrors("studentAiFeatureFailed") }, { status: 502 });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_deaf_mode_assist_ai",
    resourceType: "StudentAiFeature",
    resourceId: "live_transcription_start",
  });

  return NextResponse.json({ sessionId: session.id });
}

/**
 * Same authorization/query shape as GET /api/courses/[courseCode]/keyterms
 * (src/app/api/courses/[courseCode]/keyterms/route.ts) — duplicated rather
 * than imported since that route doesn't export its logic as a reusable
 * function and this is a small, self-contained query; kept identical on
 * purpose (real FacultyCourseLink enrollment check, approved+non-deleted
 * keyterms only, tenant-scoped).
 */
async function resolveApprovedKeyterms(tenantId: string, userId: string, courseCode: string): Promise<string[] | null> {
  const db = getTenantScopedPrisma(tenantId);
  const studentProfile = await db.studentProfile.findUnique({ where: { userId } });
  if (!studentProfile) return null;

  const links = await db.facultyCourseLink.findMany({
    where: { studentProfileId: studentProfile.id, courseCode },
    select: { facultyUserId: true },
  });
  if (links.length === 0) return null;

  const keyterms = await db.lectureKeyterm.findMany({
    where: {
      courseCode,
      approved: true,
      deletedAt: null,
      facultyUserId: { in: links.map((l) => l.facultyUserId) },
    },
    orderBy: { term: "asc" },
    select: { term: true },
  });
  return keyterms.map((k) => k.term);
}
