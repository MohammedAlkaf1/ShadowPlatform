import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireRole, AuthError } from "@/lib/session";
import { assertFacultyTeachesCourse, FacultyAccessError } from "@/lib/faculty-access";
import { extractLectureKeytermsFromPdf } from "@/lib/ai";
import { verifyFileContent } from "@/lib/file-validation";
import { logAudit } from "@/lib/audit";

// Dedicated env var, NOT shared with MAX_FACULTY_RESOURCE_SIZE_BYTES or
// MAX_EXAM_PDF_SIZE_BYTES (unrelated features) - same reasoning as the exam
// feature's own dedicated limit: real lecture-slide PDFs commonly run
// 5-30MB, 50MB default gives headroom above the realistic upper end.
const MAX_PDF_SIZE_BYTES = Number(process.env.MAX_LECTURE_KEYTERM_PDF_SIZE_BYTES ?? 52_428_800);

/**
 * POST /api/faculty/keyterms/extract — multipart/form-data.
 *
 * Fields: file (PDF slides), courseCode.
 *
 * Server-side-only Gemini call — see src/lib/ai.ts's top-of-file comment
 * for the explicit, scoped exception this relies on. Returns extracted
 * terms as PLAIN JSON DATA; this route never writes to the database — the
 * teacher's browser renders the response as an editable draft list, and
 * only a separate call to POST /api/faculty/keyterms (fired when the
 * faculty member explicitly approves, after reviewing/editing) persists
 * anything. Mirrors POST /api/faculty/exams/generate's identical
 * "generate-then-separately-save" split.
 */
export async function POST(request: Request) {
  const tErrors = await getTranslations("Common.errors");
  let ctx;
  try {
    ctx = await requireRole("faculty");
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "UNAUTHENTICATED" ? 401 : 403 });
    }
    throw err;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: tErrors("invalidData") }, { status: 400 });
  }

  const file = formData.get("file");
  const courseCode = formData.get("courseCode");

  if (!(file instanceof File) || typeof courseCode !== "string" || !courseCode) {
    return NextResponse.json({ error: tErrors("attachPdfAndChooseCourse") }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: tErrors("pdfOnly") }, { status: 400 });
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    const maxMb = Math.round(MAX_PDF_SIZE_BYTES / 1_048_576);
    const fileMb = (file.size / 1_048_576).toFixed(1);
    return NextResponse.json(
      { error: tErrors("fileSizeExceedsLimit", { fileMb, maxMb }) },
      { status: 400 }
    );
  }

  try {
    await assertFacultyTeachesCourse(ctx, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  if (!(await verifyFileContent(pdfBytes, "application/pdf"))) {
    return NextResponse.json({ error: tErrors("pdfOnly") }, { status: 400 });
  }

  let terms;
  try {
    terms = await extractLectureKeytermsFromPdf(pdfBytes);
  } catch {
    return NextResponse.json({ error: tErrors("keytermExtractionFailed") }, { status: 502 });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "extract_lecture_keywords_ai",
    resourceType: "LectureKeyterm",
  });

  return NextResponse.json({ terms });
}
