import "server-only";
import { prisma } from "@/lib/db";
import { buildQueueWhere } from "@/lib/queue-query";
import { EXPORT_BATCH_SIZE } from "@/lib/constants";
import type { QueueFilter } from "@/lib/validate";
import type { PendingRecord } from "@prisma/client";

/**
 * Async-iterate the records matching a filter, in keyset-paged batches.
 * Memory stays flat regardless of total size — we only ever hold one batch.
 * Shared by CSV/JSON streaming and the XLSX builder.
 */
export async function* iterateRecords(
  filter: QueueFilter,
): AsyncGenerator<PendingRecord> {
  const where = buildQueueWhere(filter);
  let cursor: string | undefined;

  for (;;) {
    const batch: PendingRecord[] = await prisma.pendingRecord.findMany({
      where,
      // Same ordering as the dashboard — highest QC first across all pages.
      orderBy: [
        { uniqueQcImages: { sort: "desc", nulls: "last" } },
        { enterpriseId: "asc" },
      ],
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { enterpriseId: cursor } } : {}),
    });
    if (batch.length === 0) return;
    for (const r of batch) yield r;
    if (batch.length < EXPORT_BATCH_SIZE) return;
    cursor = batch[batch.length - 1].enterpriseId;
  }
}

/** Human-readable scope tag for filenames, e.g. "csm_aarav" or "resolved". */
export function scopeTag(filter: QueueFilter): string {
  if (filter.csm) return `csm_${filter.csm.split("@")[0]}`;
  return filter.status.toLowerCase();
}
