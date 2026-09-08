import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { logAudit } from "@/lib/audit";

/**
 * DELETE /api/faculty/keyterms/:id — soft-deletes one term from the CALLING
 * faculty member's own glossary. Only the term's own facultyUserId may
 * delete it, same ownership posture as every other faculty-owned resource
 * in this codebase (Exam, FacultyResource) — 404, never 403, for a term
 * this faculty member doesn't own.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tErrors = await getTranslations("Common.errors");
  const { id } = await params;

  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const keyterm = await db.lectureKeyterm.findUnique({ where: { id } });
  if (!keyterm || keyterm.deletedAt || keyterm.facultyUserId !== ctx.userId) {
    return NextResponse.json({ error: tErrors("keytermNotFound") }, { status: 404 });
  }

  await db.lectureKeyterm.update({ where: { id }, data: { deletedAt: new Date() } });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "delete_lecture_keyterm",
    resourceType: "LectureKeyterm",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
