-- Add the unique_qc_image signal used as the default sort inside a CSM group.
-- Nullable: not all records will have a value, especially newly-onboarded
-- enterprises with no QC activity yet.
ALTER TABLE "pending_record" ADD COLUMN "unique_qc_image" INTEGER;
