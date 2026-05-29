-- AlterTable: enterprise lifecycle stage, the new primary grouping/filter dimension.
ALTER TABLE "pending_record" ADD COLUMN "stage" TEXT;

-- CreateIndex: powers home grouping + filtering by stage (mirrors the status+csm_email index).
CREATE INDEX "pending_record_status_stage_idx" ON "pending_record"("status", "stage");
