-- AlterTable: add chapterTitle nullable first so existing rows (created
-- before this feature existed) can be backfilled instead of failing the
-- migration.
ALTER TABLE "lecture_keyterms" ADD COLUMN     "chapterTitle" TEXT;

-- Backfill: existing rows predate the per-chapter grouping feature and
-- have no real chapter to attribute to. Labeled "غير مصنّف" (Uncategorized)
-- so they still render as a real section on the faculty review page
-- instead of silently disappearing or crashing on a NULL group key.
UPDATE "lecture_keyterms" SET "chapterTitle" = 'غير مصنّف' WHERE "chapterTitle" IS NULL;

-- Now that every row has a value, enforce NOT NULL going forward.
ALTER TABLE "lecture_keyterms" ALTER COLUMN "chapterTitle" SET NOT NULL;
