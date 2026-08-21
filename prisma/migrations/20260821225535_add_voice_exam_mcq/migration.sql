-- CreateEnum
CREATE TYPE "ExamSource" AS ENUM ('MANUAL', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ');

-- CreateEnum
CREATE TYPE "ExamSubmissionStatus" AS ENUM ('in_progress', 'completed');

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "facultyUserId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "source" "ExamSource" NOT NULL,
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'MCQ',
    "order" INTEGER NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentUserId" TEXT NOT NULL,
    "status" "ExamSubmissionStatus" NOT NULL DEFAULT 'in_progress',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "exam_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "examSubmissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "voiceConfirmationObjectKey" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_tenantId_idx" ON "exams"("tenantId");

-- CreateIndex
CREATE INDEX "exams_facultyUserId_idx" ON "exams"("facultyUserId");

-- CreateIndex
CREATE INDEX "exams_tenantId_courseCode_idx" ON "exams"("tenantId", "courseCode");

-- CreateIndex
CREATE INDEX "questions_examId_idx" ON "questions"("examId");

-- CreateIndex
CREATE INDEX "question_options_questionId_idx" ON "question_options"("questionId");

-- CreateIndex
CREATE INDEX "exam_submissions_tenantId_idx" ON "exam_submissions"("tenantId");

-- CreateIndex
CREATE INDEX "exam_submissions_examId_idx" ON "exam_submissions"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_submissions_examId_studentUserId_key" ON "exam_submissions"("examId", "studentUserId");

-- CreateIndex
CREATE INDEX "answers_examSubmissionId_idx" ON "answers"("examSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "answers_examSubmissionId_questionId_key" ON "answers"("examSubmissionId", "questionId");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_facultyUserId_fkey" FOREIGN KEY ("facultyUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_examSubmissionId_fkey" FOREIGN KEY ("examSubmissionId") REFERENCES "exam_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
