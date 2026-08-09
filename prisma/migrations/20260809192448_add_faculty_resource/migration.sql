-- CreateEnum
CREATE TYPE "FacultyResourceCategory" AS ENUM ('simplified_content', 'visual_adjustment', 'extra_exercises', 'other');

-- CreateTable
CREATE TABLE "faculty_resources" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" "FacultyResourceCategory",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "faculty_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faculty_resources_tenantId_idx" ON "faculty_resources"("tenantId");

-- CreateIndex
CREATE INDEX "faculty_resources_studentProfileId_idx" ON "faculty_resources"("studentProfileId");

-- CreateIndex
CREATE INDEX "faculty_resources_uploadedByUserId_idx" ON "faculty_resources"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "faculty_resources" ADD CONSTRAINT "faculty_resources_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_resources" ADD CONSTRAINT "faculty_resources_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_resources" ADD CONSTRAINT "faculty_resources_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
