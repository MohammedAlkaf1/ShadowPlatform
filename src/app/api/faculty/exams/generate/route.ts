import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/session";
import { assertFacultyTeachesCourse, FacultyAccessError } from "@/lib/faculty-access";
import { generateExamQuestionsFromPdf } from "@/lib/ai";
import { logAudit } from "@/lib/audit";

const MAX_PDF_SIZE_BYTES = Number(process.env.MAX_FACULTY_RESOURCE_SIZE_BYTES ?? 20_971_520);

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

  if (!(file instanceof File) || typeof courseCode !== "string" || !courseCode) {
    return NextResponse.json({ error: "الرجاء إرفاق ملف PDF واختيار مقرر" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "يُسمح فقط برفع ملفات PDF" }, { status: 400 });
  }
  if (file.size > MAX_PDF_SIZE_BYTES) {
    return NextResponse.json({ error: "حجم الملف يتجاوز الحد المسموح" }, { status: 400 });
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

  const pdfBytes = Buffer.from(await file.arrayBuffer());

  let questions;
  try {
    questions = await generateExamQuestionsFromPdf(pdfBytes, approxQuestionCount);
  } catch {
    return NextResponse.json({ error: "تعذر توليد الأسئلة من الملف، حاول مرة أخرى" }, { status: 502 });
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: "تعذر توليد الأسئلة من الملف، حاول مرة أخرى" }, { status: 502 });
  }

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "generate_exam_ai",
    resourceType: "Exam",
  });

  return NextResponse.json({ questions });
}
