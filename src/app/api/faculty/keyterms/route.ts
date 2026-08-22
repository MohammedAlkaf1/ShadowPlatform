import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, AuthError } from "@/lib/session";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertFacultyTeachesCourse, FacultyAccessError } from "@/lib/faculty-access";
import { logAudit } from "@/lib/audit";

const termInputSchema = z.object({
  term: z.string().trim().min(1),
  // Which bucket this term came from in the review UI — AI_EXTRACTED for
  // terms that were part of the Gemini-generated draft (kept after
  // review), MANUAL for ones the faculty member typed in themselves. Both
  // are equally "approved: true" the moment this endpoint is called —
  // the review/approval step already happened client-side before this
  // request was sent (see POST /api/faculty/keyterms/extract's doc
  // comment on the two-step generate-then-save split).
  source: z.enum(["AI_EXTRACTED", "MANUAL"]).default("MANUAL"),
});

const saveTermsSchema = z.object({
  courseCode: z.string().trim().min(1),
  terms: z.array(termInputSchema).max(500),
});

/**
 * GET /api/faculty/keyterms?courseCode=... — the CALLING faculty member's
 * own approved glossary for one course (their authoring view, includes
 * unapproved rows too aren't a thing here — everything this endpoint
 * returns to the FACULTY member is their own data regardless of approval
 * state, unlike the student-facing GET /api/courses/:id/keyterms which
 * only ever returns approved terms).
 */
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const { searchParams } = new URL(request.url);
  const courseCode = searchParams.get("courseCode");
  if (!courseCode) {
    return NextResponse.json({ error: "courseCode مطلوب" }, { status: 400 });
  }

  const db = getTenantScopedPrisma(ctx.tenantId);
  const keyterms = await db.lectureKeyterm.findMany({
    where: { facultyUserId: ctx.userId, courseCode, deletedAt: null },
    orderBy: { term: "asc" },
    select: { id: true, term: true, source: true, approved: true, createdAt: true },
  });

  return NextResponse.json({ keyterms });
}

/**
 * POST /api/faculty/keyterms — approves and persists a batch of terms for
 * one course (both the "approve the AI-extracted draft after review" action
 * and manually-typed additions call this — by the time either does, the
 * term list is finalized data the faculty member stands behind).
 *
 * ACCUMULATES, never replaces: existing approved terms for this
 * faculty+course are left untouched; only genuinely new terms (by
 * case-insensitive text, enforced by the unique(facultyUserId, courseCode,
 * term) constraint) are inserted, via skipDuplicates rather than a
 * delete-then-recreate — re-uploading slides for the same course later in
 * the term adds to the glossary, it never wipes it.
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const json = await request.json().catch(() => null);
  const parsed = saveTermsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { courseCode, terms } = parsed.data;

  try {
    await assertFacultyTeachesCourse(ctx, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const db = getTenantScopedPrisma(ctx.tenantId);

  // Dedup the incoming batch itself (case-insensitive) before insert — the
  // unique constraint would reject exact-text dupes anyway via
  // skipDuplicates, but this also collapses e.g. "API" vs "api" submitted
  // together in the same batch down to one row.
  const seen = new Set<string>();
  const uniqueTerms = terms.filter((t) => {
    const key = t.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = await db.lectureKeyterm.createMany({
    data: uniqueTerms.map((t) => ({
      tenantId: ctx.tenantId,
      facultyUserId: ctx.userId,
      courseCode,
      term: t.term,
      source: t.source,
      approved: true,
    })),
    skipDuplicates: true,
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "approve_lecture_keyterms",
    resourceType: "LectureKeyterm",
  });

  return NextResponse.json({ ok: true, addedCount: result.count }, { status: 201 });
}
