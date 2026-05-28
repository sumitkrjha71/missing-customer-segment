-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('PENDING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ASSIGN', 'CHURN');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CSM', 'ADMIN');

-- CreateTable
CREATE TABLE "pending_record" (
    "enterprise_id" TEXT NOT NULL,
    "enterprise_name" TEXT,
    "csm_name" TEXT,
    "csm_email" TEXT,
    "account_status" TEXT,
    "source_segment" TEXT,
    "segment" TEXT,
    "source_created_at" TIMESTAMP(3),
    "source_updated_at" TIMESTAMP(3),
    "status" "RecordStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 0,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_record_pkey" PRIMARY KEY ("enterprise_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "enterprise_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "from_segment" TEXT,
    "to_segment" TEXT,
    "from_status" TEXT,
    "to_status" TEXT,
    "actor_email" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "rows_fetched" INTEGER NOT NULL DEFAULT 0,
    "rows_upserted" INTEGER NOT NULL DEFAULT 0,
    "rows_invalid" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CSM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE INDEX "pending_record_status_idx" ON "pending_record"("status");

-- CreateIndex
CREATE INDEX "pending_record_status_csm_email_idx" ON "pending_record"("status", "csm_email");

-- CreateIndex
CREATE INDEX "pending_record_first_seen_at_idx" ON "pending_record"("first_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_idempotency_key_key" ON "audit_log"("idempotency_key");

-- CreateIndex
CREATE INDEX "audit_log_enterprise_id_created_at_idx" ON "audit_log"("enterprise_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_email_created_at_idx" ON "audit_log"("actor_email", "created_at");

-- CreateIndex
CREATE INDEX "sync_run_started_at_idx" ON "sync_run"("started_at");
