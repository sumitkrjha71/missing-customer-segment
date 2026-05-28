-- This migration:
--   • Adds `last_received_at` to pending_record (the new Metabase column).
--   • Converts audit_log.action from a PostgreSQL ENUM ("AuditAction") to a
--     plain TEXT column, so adding future action values doesn't run into
--     PostgreSQL's "ALTER TYPE ADD VALUE cannot run inside a transaction"
--     restriction. Existing 'ASSIGN' / 'CHURN' values are preserved verbatim.
--   • Adds from_csm_email / to_csm_email so the new ASSIGN_CSM action has
--     somewhere structured to record the email change.
--
-- All operations are schema-only and safe in a single transaction.

ALTER TABLE "pending_record" ADD COLUMN "last_received_at" TIMESTAMP(3);

ALTER TABLE "audit_log" ALTER COLUMN "action" TYPE TEXT USING "action"::text;
DROP TYPE "AuditAction";

ALTER TABLE "audit_log" ADD COLUMN "from_csm_email" TEXT;
ALTER TABLE "audit_log" ADD COLUMN "to_csm_email" TEXT;
