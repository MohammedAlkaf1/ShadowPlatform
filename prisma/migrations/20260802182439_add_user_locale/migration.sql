-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'en');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'ar';
