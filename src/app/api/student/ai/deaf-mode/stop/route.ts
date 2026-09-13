import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireMobileRole } from "@/lib/api-auth";
import { stopSessionGracefully } from "@/lib/deaf-mode-session";
import { logAudit } from "@/lib/audit";

/**
 * POST /api/student/ai/deaf-mode/stop?sessionId=... — user-initiated end of
 * a live transcription session. Sends Deepgram's documented CloseStream
 * control message (flushes a final transcript before closing), gives it a
 * short grace window to arrive over the still-open SSE stream, then closes
 * both the Deepgram connection and the SSE stream cleanly (an
 * `event: session_ended` frame is sent first so the client's SSE reader
 * ends deterministically rather than just seeing the connection drop).
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  const auth = await requireMobileRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const stopped = await stopSessionGracefully(sessionId, ctx.userId);
  if (!stopped) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 404 });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "use_deaf_mode_assist_ai",
    resourceType: "StudentAiFeature",
    resourceId: "live_transcription_stop",
  });

  return new NextResponse(null, { status: 204 });
}
