-- AlterTable
-- Safe two-step approach for adding a required column to a non-empty table:
-- 1) add nullable, 2) backfill existing rows, 3) enforce NOT NULL.
-- Existing rows are backfilled from the local-part of their email (e.g.
-- "student@demo.shadow.sa" -> "student") as a readable placeholder — real
-- demo users get a proper Arabic fullName via prisma/seed.ts's upserts,
-- which run right after this migration and will overwrite this placeholder
-- for every seeded user. This is only a safety net for any row seed.ts
-- doesn't happen to touch.
ALTER TABLE "users" ADD COLUMN     "fullName" TEXT;

UPDATE "users" SET "fullName" = split_part("email", '@', 1) WHERE "fullName" IS NULL;

ALTER TABLE "users" ALTER COLUMN "fullName" SET NOT NULL;
