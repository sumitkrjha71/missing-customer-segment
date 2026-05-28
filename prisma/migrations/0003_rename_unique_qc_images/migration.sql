-- Corrects the QC-signal column name to match the Metabase question.
-- Tolerant of both states: rename if the singular column exists; otherwise
-- add the plural column directly (so this is safe whether or not 0002 has
-- already been applied).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_record' AND column_name = 'unique_qc_image'
  ) THEN
    ALTER TABLE "pending_record" RENAME COLUMN "unique_qc_image" TO "unique_qc_images";
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pending_record' AND column_name = 'unique_qc_images'
  ) THEN
    ALTER TABLE "pending_record" ADD COLUMN "unique_qc_images" INTEGER;
  END IF;
END$$;
