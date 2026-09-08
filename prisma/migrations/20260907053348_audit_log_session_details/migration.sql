-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "logHash" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "userAgent" TEXT;
