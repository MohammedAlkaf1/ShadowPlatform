import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/session";
import { assertFacultyTeachesCourse, FacultyAccessError } from "@/lib/faculty-access";
import { generateExamQuestionsFromPdf, type ExamQuestionLanguage } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

// Dedicated env var, NOT shared with MAX_FACULTY_RESOURCE_SIZE_BYTES (an
// unrelated feature) - real lecture-slide PDFs with embedded images/charts
// commonly run 5-30MB, and reusing that other feature's 20MB default was
// too tight, causing real uploads to be rejected. 50MB default gives
// headroom above the realistic upper end.
const MAX_PDF_SIZE_BYTES = Number(process.env.MAX_EXAM_PDF_SIZE_BYTES ?? 52_428_800);

/**
 * POST /api/faculty/exams/generate — multipart/form-data.
 *
 * Fields: file (PDF slides), courseCode, questionCount (approximate).
 *
 * Server-side-only Gemini call — see src/lib/ai.ts's top-of-file comment
 * for the explicit, scoped exception to this project's "no AI inside the
 * platform" rule. Returns generated questions as PLAIN JSON DATA; this
 * route never writes to the database and never publishes anything — the
 * teacher's browser renders the response as an editable draft, and only
 * POST /api/faculty/exams (a completely separate call, firing when the
 * teacher explicitly clicks save/publish) persists anything.
 */
export async function POST(request: Request) {
  const t0 = Date.now();
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
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const file = formData.get("file");
  const courseCode = formData.get("courseCode");
  const questionCountRaw = formData.get("questionCount");
  const languageRaw = formData.get("language");

  if (!(file instanceof File) || typeof courseCode !== "string" || !courseCode) {
    return NextResponse.json({ error: "الرجاء إرفاق ملف PDF واختيار مقرر" }, { status: 400 });
  }
  if (languageRaw !== "ar" && languageRaw !== "en") {
    return NextResponse.json({ error: "الرجاء اختيار لغة الأسئلة" }, { status: 400 });
  }
  const language: ExamQuestionLanguage = languageRaw;
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "يُسمح فقط برفع ملفات PDF" }, { status: 400 });
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    const maxMb = Math.round(MAX_PDF_SIZE_BYTES / 1_048_576);
    const fileMb = (file.size / 1_048_576).toFixed(1);
    return NextResponse.json(
      { error: `حجم الملف (${fileMb} ميجابايت) يتجاوز الحد المسموح (${maxMb} ميجابايت)` },
      { status: 400 }
    );
  }

  const questionCount = Number(questionCountRaw);
  const approxQuestionCount = Number.isFinite(questionCount) && questionCount > 0 ? Math.min(Math.round(questionCount), 30) : 10;

  try {
    await assertFacultyTeachesCourse(ctx, courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const tReceived = Date.now();
  const pdfBytes = Buffer.from(await file.arrayBuffer());
  const tRead = Date.now();

  let questions;
  try {
    questions = await generateExamQuestionsFromPdf(pdfBytes, approxQuestionCount, language);
  } catch {
    return NextResponse.json({ error: "تعذر توليد الأسئلة من الملف، حاول مرة أخرى" }, { status: 502 });
  }
  const tGemini = Date.now();

  if (questions.length === 0) {
    return NextResponse.json({ error: "تعذر توليد الأسئلة من الملف، حاول مرة أخرى" }, { status: 502 });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "generate_exam_ai",
    resourceType: "Exam",
  });
  const tAudit = Date.now();

  // Temporary stage-by-stage timing to diagnose real-world slowness
  // reports (see برومبت_تسريع_التوليد_ولغة_الأسئلة.md task 2) — the PDF
  // already goes straight to Gemini as inline bytes with no intermediate
  // parsing/re-encoding step, so if this log shows tGemini dominating,
  // the bottleneck is the Gemini call itself, not this route's own code.
  console.log(
    `[exams/generate] auth+parse=${tReceived - t0}ms readFile=${tRead - tReceived}ms ` +
      `gemini=${tGemini - tRead}ms audit=${tAudit - tGemini}ms total=${tAudit - t0}ms ` +
      `fileSizeMb=${(file.size / 1_048_576).toFixed(1)} questionCount=${questions.length}`
  );

  return NextResponse.json({ questions });
}
