import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireApiRole } from "@/lib/api-auth";
import { getTenantScopedPrisma } from "@/lib/tenant-db";
import { assertStudentEnrolledInCourse, FacultyAccessError } from "@/lib/faculty-access";
import { putPlainObject, buildExamAnswerAudioObjectKey } from "@/lib/s3";
import { logAudit } from "@/lib/audit";

const MAX_AUDIO_SIZE_BYTES = 10_485_760; // 10MB - generous for a short spoken confirmation clip

/**
 * POST /api/exams/:id/answers — student-facing (Flutter app), dual-auth.
 * multipart/form-data fields: questionId, selectedOptionId,
 * voiceConfirmationAudio (optional file — the student's spoken confirmation
 * of the option they picked; same multipart shape family as
 * POST /api/documents/upload / POST /api/faculty/resources, one file field
 * plus plain string fields).
 *
 * Creates the calling student's ExamSubmission lazily on first answer
 * (status "in_progress") if none exists yet for this exam, then
 * creates/updates (upsert-by-unique-pair) the Answer for `questionId`
 * scoped to that submission — never any other student's. Audio, when
 * present, is stored PLAINTEXT via the same pattern as FacultyResource
 * (see s3.ts's buildExamAnswerAudioObjectKey doc comment): this is a voice
 * confirmation of an MCQ answer choice, not a medical document, so it does
 * not need Document's AES-256-GCM encryption pipeline — judgment call,
 * flagged explicitly in the feature report.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: examId } = await params;

  const auth = await requireApiRole(request, "student");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const questionId = formData.get("questionId");
  const selectedOptionId = formData.get("selectedOptionId");
  const audioFile = formData.get("voiceConfirmationAudio");

  if (typeof questionId !== "string" || !questionId || typeof selectedOptionId !== "string" || !selectedOptionId) {
    return NextResponse.json({ error: "questionId و selectedOptionId مطلوبان" }, { status: 400 });
  }
  if (audioFile !== null && !(audioFile instanceof File)) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  if (audioFile instanceof File && audioFile.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json({ error: "حجم الملف الصوتي يتجاوز الحد المسموح" }, { status: 400 });
  }

  const db = getTenantScopedPrisma(ctx.tenantId);

  const exam = await db.exam.findUnique({ where: { id: examId } });
  if (!exam || exam.deletedAt || !exam.availableAt || exam.availableAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "لم يتم العثور على الاختبار" }, { status: 404 });
  }

  try {
    await assertStudentEnrolledInCourse(ctx, exam.facultyUserId, exam.courseCode);
  } catch (err) {
    if (err instanceof FacultyAccessError) {
      return NextResponse.json({ error: "لم يتم العثور على الاختبار" }, { status: 404 });
    }
    throw err;
  }

  // The question and selected option must both actually belong to THIS
  // exam — never trust the client-supplied ids to be internally
  // consistent, even from an already-verified-enrolled student.
  const question = await db.question.findFirst({
    where: { id: questionId, examId },
    include: { options: true },
  });
  if (!question) {
    return NextResponse.json({ error: "لم يتم العثور على السؤال" }, { status: 404 });
  }
  const option = question.options.find((o) => o.id === selectedOptionId);
  if (!option) {
    return NextResponse.json({ error: "لم يتم العثور على الخيار" }, { status: 404 });
  }

  // Lazily create the ExamSubmission on first answer — @@unique([examId,
  // studentUserId]) makes this safe to race (a second concurrent call from
  // the same student would violate the unique constraint; caught below by
  // re-querying rather than assuming create always wins).
  let submission = await db.examSubmission.findUnique({
    where: { examId_studentUserId: { examId, studentUserId: ctx.userId } },
  });
  if (!submission) {
    submission = await db.examSubmission
      .create({ data: { tenantId: ctx.tenantId, examId, studentUserId: ctx.userId, status: "in_progress" } })
      .catch(() =>
        db.examSubmission.findUniqueOrThrow({
          where: { examId_studentUserId: { examId, studentUserId: ctx.userId } },
        })
      );
  }

  let voiceConfirmationObjectKey: string | null = null;
  if (audioFile instanceof File) {
    const answerId = randomUUID();
    const objectKey = buildExamAnswerAudioObjectKey(ctx.tenantId, submission.id, answerId, audioFile.name || "audio.webm");
    const bytes = Buffer.from(await audioFile.arrayBuffer());
    await putPlainObject(objectKey, bytes, audioFile.type || "application/octet-stream");
    voiceConfirmationObjectKey = objectKey;
  }

  const answer = await db.answer.upsert({
    where: { examSubmissionId_questionId: { examSubmissionId: submission.id, questionId } },
    create: {
      examSubmissionId: submission.id,
      questionId,
      selectedOptionId,
      voiceConfirmationObjectKey,
    },
    update: {
      selectedOptionId,
      // Only overwrite the stored audio key if a new clip was actually
      // uploaded on this call — a re-answer without re-recording keeps the
      // previous confirmation clip rather than nulling it out.
      ...(voiceConfirmationObjectKey ? { voiceConfirmationObjectKey } : {}),
      answeredAt: new Date(),
    },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: "submit_exam_answer",
    resourceType: "Answer",
    resourceId: answer.id,
  });

  // Mark the submission completed once every question in the exam has an
  // answer row — the client (voice-driven exam screen) already knows
  // locally when it's on the last question, but the submission's own
  // status/completedAt would otherwise sit at "in_progress" forever with no
  // server-side signal that the student actually finished. Re-checked on
  // every call (not just guarded by "is this the last question" client
  // input) so it self-corrects even if answers arrive out of order or a
  // previous call was interrupted.
  if (submission.status === "in_progress") {
    const [answeredCount, totalCount] = await Promise.all([
      db.answer.count({ where: { examSubmissionId: submission.id } }),
      db.question.count({ where: { examId } }),
    ]);
    if (answeredCount >= totalCount) {
      // Score computed ONCE here, at completion, and stored — not
      // recalculated on every read of the faculty results page (see
      // ExamSubmission.score's schema comment). Grading is a plain
      // correct-count ratio, no AI involved: MCQ correctness is fully
      // determined by QuestionOption.isCorrect, already in the DB.
      const answers = await db.answer.findMany({
        where: { examSubmissionId: submission.id },
        include: { selectedOption: { select: { isCorrect: true } } },
      });
      const correctCount = answers.filter((a) => a.selectedOption?.isCorrect === true).length;
      const score = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

      await db.examSubmission.update({
        where: { id: submission.id },
        data: { status: "completed", completedAt: new Date(), score },
      });
    }
  }

  return NextResponse.json({ ok: true, answerId: answer.id, examSubmissionId: submission.id }, { status: 201 });
}
