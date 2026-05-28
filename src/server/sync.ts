import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fetchPendingRows } from "@/lib/metabase";
import type { NormalizedRow } from "@/lib/validate";
import { log } from "@/lib/logger";

const UPSERT_CHUNK = 500;

export interface SyncOutcome {
  syncRunId: string;
  fetched: number;
  upserted: number;
  invalid: number;
  durationMs: number;
}

/**
 * Pull the Metabase question and reconcile it into the local queue.
 *
 * THE load-bearing guarantee (no resurrection): the ON CONFLICT update only
 * refreshes mirror columns, only for rows whose local status is NOT 'RESOLVED'.
 * `status` and `version` are never touched here, so a record a CSM already
 * resolved stays resolved no matter what Metabase still reports.
 */
export async function runSync(opts?: { url?: string }): Promise<SyncOutcome> {
  const startedAt = Date.now();
  const run = await prisma.syncRun.create({ data: {} }); // status RUNNING

  try {
    const { rows, fetched, invalid } = await fetchPendingRows({ url: opts?.url });

    let upserted = 0;
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      upserted += await upsertChunk(chunk);
    }

    const durationMs = Date.now() - startedAt;
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        rowsFetched: fetched,
        rowsUpserted: upserted,
        rowsInvalid: invalid,
      },
    });

    log.info("sync.success", {
      syncRunId: run.id,
      fetched,
      upserted,
      invalid,
      durationMs,
    });
    return { syncRunId: run.id, fetched, upserted, invalid, durationMs };
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: String(err) },
    });
    log.error("sync.failed", { syncRunId: run.id, error: String(err) });
    throw err;
  }
}

/**
 * Set-based upsert for one chunk. One round-trip per chunk (not per row).
 * Returns the number of rows inserted or refreshed.
 */
async function upsertChunk(rows: NormalizedRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const now = new Date();
  const values = rows.map(
    (r) => Prisma.sql`(
      ${r.enterpriseId},
      ${r.enterpriseName},
      ${r.csmName},
      ${r.csmEmail},
      ${r.accountStatus},
      ${r.sourceSegment},
      ${r.uniqueQcImages},
      ${r.lastImageReceivedAt},
      ${r.sourceCreatedAt},
      ${r.sourceUpdatedAt},
      'PENDING'::"RecordStatus",
      ${now},
      ${now}
    )`,
  );

  // NOTE: "status" and "version" are deliberately ABSENT from the SET list.
  // The `WHERE status <> 'RESOLVED'` guard means even mirror fields are frozen
  // for resolved rows. This is the non-resurrection guarantee.
  const affected = await prisma.$executeRaw`
    INSERT INTO "pending_record" (
      "enterprise_id", "enterprise_name", "csm_name", "csm_email",
      "account_status", "source_segment", "unique_qc_images",
      "last_received_at", "source_created_at", "source_updated_at",
      "status", "last_seen_at", "updated_at"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("enterprise_id") DO UPDATE SET
      "enterprise_name"   = EXCLUDED."enterprise_name",
      "csm_name"          = EXCLUDED."csm_name",
      -- NOTE: csm_email is intentionally NOT refreshed from Metabase.
      -- An ASSIGN_CSM action taken on this portal would otherwise get
      -- silently overwritten by the next sync if Metabase still has NULL.
      -- The CSM we assigned locally is authoritative until the source DB
      -- catches up.
      "account_status"    = EXCLUDED."account_status",
      "source_segment"    = EXCLUDED."source_segment",
      "unique_qc_images"  = EXCLUDED."unique_qc_images",
      "last_received_at"  = EXCLUDED."last_received_at",
      "source_created_at" = EXCLUDED."source_created_at",
      "source_updated_at" = EXCLUDED."source_updated_at",
      "last_seen_at"      = EXCLUDED."last_seen_at",
      "updated_at"        = EXCLUDED."updated_at"
    WHERE "pending_record"."status" <> 'RESOLVED'
  `;

  return Number(affected);
}
