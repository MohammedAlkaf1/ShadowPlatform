-- CreateTable
CREATE TABLE "specialist_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "specialistUserId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialist_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "specialist_assignments_tenantId_idx" ON "specialist_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "specialist_assignments_specialistUserId_idx" ON "specialist_assignments"("specialistUserId");

-- CreateIndex
CREATE INDEX "specialist_assignments_studentProfileId_idx" ON "specialist_assignments"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "specialist_assignments_specialistUserId_studentProfileId_key" ON "specialist_assignments"("specialistUserId", "studentProfileId");

-- AddForeignKey
ALTER TABLE "specialist_assignments" ADD CONSTRAINT "specialist_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_assignments" ADD CONSTRAINT "specialist_assignments_specialistUserId_fkey" FOREIGN KEY ("specialistUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_assignments" ADD CONSTRAINT "specialist_assignments_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specialist_assignments" ADD CONSTRAINT "specialist_assignments_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
