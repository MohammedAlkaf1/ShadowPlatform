-- CreateEnum
CREATE TYPE "LectureKeytermSource" AS ENUM ('AI_EXTRACTED', 'MANUAL');

-- CreateTable
CREATE TABLE "lecture_keyterms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facultyUserId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "source" "LectureKeytermSource" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "lecture_keyterms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lecture_keyterms_tenantId_idx" ON "lecture_keyterms"("tenantId");

-- CreateIndex
CREATE INDEX "lecture_keyterms_facultyUserId_idx" ON "lecture_keyterms"("facultyUserId");

-- CreateIndex
CREATE INDEX "lecture_keyterms_tenantId_courseCode_idx" ON "lecture_keyterms"("tenantId", "courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "lecture_keyterms_facultyUserId_courseCode_term_key" ON "lecture_keyterms"("facultyUserId", "courseCode", "term");

-- AddForeignKey
ALTER TABLE "lecture_keyterms" ADD CONSTRAINT "lecture_keyterms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lecture_keyterms" ADD CONSTRAINT "lecture_keyterms_facultyUserId_fkey" FOREIGN KEY ("facultyUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
