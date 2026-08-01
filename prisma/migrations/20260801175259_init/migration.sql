-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'faculty', 'specialist', 'admin');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'reviewed');

-- CreateEnum
CREATE TYPE "SupportPlanStatus" AS ENUM ('draft', 'approved', 'expired');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "ToolCode" AS ENUM ('REMINDER_MODE', 'FOCUS_MODE', 'EXTRA_TIME_TRACKER', 'SIMPLIFIED_UI', 'TEXT_TO_SPEECH', 'SPEECH_TO_TEXT', 'VISUAL_SCHEDULE', 'CALM_MODE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "selfSignupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailDomain" TEXT,
    "documentRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "major" TEXT NOT NULL,
    "academicStage" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'pending',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_levels" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "support_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "encryptionKeyRef" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "specialistUserId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "supportLevelId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" "SupportPlanStatus" NOT NULL DEFAULT 'draft',
    "approvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_activations" (
    "id" TEXT NOT NULL,
    "supportPlanId" TEXT NOT NULL,
    "toolCode" "ToolCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,

    CONSTRAINT "tool_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_revisions" (
    "id" TEXT NOT NULL,
    "supportPlanId" TEXT NOT NULL,
    "revisedByUserId" TEXT NOT NULL,
    "newSupportLevelId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_alerts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "assignedSpecialistId" TEXT NOT NULL,
    "triggeredByUsageEventId" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_course_links" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "facultyUserId" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "approvedAccommodations" JSONB,

    CONSTRAINT "faculty_course_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetStudentProfileId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");

-- CreateIndex
CREATE INDEX "student_profiles_tenantId_idx" ON "student_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "student_profiles_tenantId_requestStatus_idx" ON "student_profiles"("tenantId", "requestStatus");

-- CreateIndex
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_code_key" ON "categories"("tenantId", "code");

-- CreateIndex
CREATE INDEX "conditions_tenantId_idx" ON "conditions"("tenantId");

-- CreateIndex
CREATE INDEX "conditions_categoryId_idx" ON "conditions"("categoryId");

-- CreateIndex
CREATE INDEX "support_levels_tenantId_idx" ON "support_levels"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "support_levels_tenantId_order_key" ON "support_levels"("tenantId", "order");

-- CreateIndex
CREATE INDEX "documents_tenantId_idx" ON "documents"("tenantId");

-- CreateIndex
CREATE INDEX "documents_studentProfileId_idx" ON "documents"("studentProfileId");

-- CreateIndex
CREATE INDEX "assessments_tenantId_idx" ON "assessments"("tenantId");

-- CreateIndex
CREATE INDEX "assessments_studentProfileId_idx" ON "assessments"("studentProfileId");

-- CreateIndex
CREATE INDEX "assessments_specialistUserId_idx" ON "assessments"("specialistUserId");

-- CreateIndex
CREATE INDEX "support_plans_tenantId_idx" ON "support_plans"("tenantId");

-- CreateIndex
CREATE INDEX "support_plans_studentProfileId_idx" ON "support_plans"("studentProfileId");

-- CreateIndex
CREATE INDEX "tool_activations_supportPlanId_idx" ON "tool_activations"("supportPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "tool_activations_supportPlanId_toolCode_key" ON "tool_activations"("supportPlanId", "toolCode");

-- CreateIndex
CREATE INDEX "plan_revisions_supportPlanId_idx" ON "plan_revisions"("supportPlanId");

-- CreateIndex
CREATE INDEX "usage_events_tenantId_idx" ON "usage_events"("tenantId");

-- CreateIndex
CREATE INDEX "usage_events_studentProfileId_idx" ON "usage_events"("studentProfileId");

-- CreateIndex
CREATE INDEX "mentor_alerts_tenantId_idx" ON "mentor_alerts"("tenantId");

-- CreateIndex
CREATE INDEX "mentor_alerts_studentProfileId_idx" ON "mentor_alerts"("studentProfileId");

-- CreateIndex
CREATE INDEX "mentor_alerts_assignedSpecialistId_idx" ON "mentor_alerts"("assignedSpecialistId");

-- CreateIndex
CREATE INDEX "faculty_course_links_tenantId_idx" ON "faculty_course_links"("tenantId");

-- CreateIndex
CREATE INDEX "faculty_course_links_facultyUserId_idx" ON "faculty_course_links"("facultyUserId");

-- CreateIndex
CREATE INDEX "faculty_course_links_studentProfileId_idx" ON "faculty_course_links"("studentProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_course_links_facultyUserId_studentProfileId_courseC_key" ON "faculty_course_links"("facultyUserId", "studentProfileId", "courseCode");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_targetStudentProfileId_idx" ON "audit_logs"("targetStudentProfileId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_levels" ADD CONSTRAINT "support_levels_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_specialistUserId_fkey" FOREIGN KEY ("specialistUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "conditions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_supportLevelId_fkey" FOREIGN KEY ("supportLevelId") REFERENCES "support_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_activations" ADD CONSTRAINT "tool_activations_supportPlanId_fkey" FOREIGN KEY ("supportPlanId") REFERENCES "support_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_revisions" ADD CONSTRAINT "plan_revisions_supportPlanId_fkey" FOREIGN KEY ("supportPlanId") REFERENCES "support_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_revisions" ADD CONSTRAINT "plan_revisions_revisedByUserId_fkey" FOREIGN KEY ("revisedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_revisions" ADD CONSTRAINT "plan_revisions_newSupportLevelId_fkey" FOREIGN KEY ("newSupportLevelId") REFERENCES "support_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_alerts" ADD CONSTRAINT "mentor_alerts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_alerts" ADD CONSTRAINT "mentor_alerts_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_alerts" ADD CONSTRAINT "mentor_alerts_assignedSpecialistId_fkey" FOREIGN KEY ("assignedSpecialistId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_alerts" ADD CONSTRAINT "mentor_alerts_triggeredByUsageEventId_fkey" FOREIGN KEY ("triggeredByUsageEventId") REFERENCES "usage_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_links" ADD CONSTRAINT "faculty_course_links_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_links" ADD CONSTRAINT "faculty_course_links_facultyUserId_fkey" FOREIGN KEY ("facultyUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_links" ADD CONSTRAINT "faculty_course_links_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_targetStudentProfileId_fkey" FOREIGN KEY ("targetStudentProfileId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
