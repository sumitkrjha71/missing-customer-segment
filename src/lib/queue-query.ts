import type { Prisma } from "@prisma/client";
import type { QueueFilter } from "@/lib/validate";

/**
 * Build the Prisma `where` for the queue from validated filters. Shared by the
 * queue list API and every export route so a filtered export matches exactly
 * what the user sees on screen.
 *
 * All predicates hit indexed columns (status, stage, first_seen_at).
 */
export function buildQueueWhere(f: QueueFilter): Prisma.PendingRecordWhereInput {
  const where: Prisma.PendingRecordWhereInput = { status: f.status };

  // Sentinel: stage=__none__ filters to records where stage IS NULL (so the
  // "No stage" group can fetch its own page like every other group).
  if (f.stage === "__none__") {
    where.stage = null;
  } else if (f.stage) {
    where.stage = f.stage;
  }

  if (f.segment) where.segment = f.segment;

  if (f.q) {
    const term = f.q;
    where.OR = [
      { enterpriseName: { contains: term, mode: "insensitive" } },
      { csmName: { contains: term, mode: "insensitive" } },
      { csmEmail: { contains: term, mode: "insensitive" } },
      { enterpriseId: { contains: term, mode: "insensitive" } },
    ];
  }

  // Last-image-received-at date range (inclusive).
  // A date string like "2026-05-28" parses as midnight UTC, but users mean the
  // WHOLE of that day — bump the upper bound to the *start* of the next day
  // and use `lt`, which is cleaner than fiddling with 23:59:59.999.
  if (f.lastReceivedFrom || f.lastReceivedTo) {
    const range: { gte?: Date; lt?: Date } = {};
    if (f.lastReceivedFrom) range.gte = f.lastReceivedFrom;
    if (f.lastReceivedTo) {
      const endExclusive = new Date(f.lastReceivedTo);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      range.lt = endExclusive;
    }
    // Filtering on a column automatically excludes NULL — that's exactly what
    // we want: a record with no last_received_at can't match a date range.
    where.lastImageReceivedAt = range;
  }

  return where;
}

/**
 * Keyset pagination args.
 *
 * Order: `unique_qc_images DESC NULLS LAST, enterprise_id ASC`.
 *   - Primary: highest-QC enterprises always come first, *across pages*, so the
 *     top of the queue actually surfaces the largest accounts even when the
 *     dataset is bigger than one page.
 *   - Secondary: enterprise_id ASC is the deterministic tiebreaker that makes
 *     the cursor stable (enterprise_id is unique, so the (QC, id) tuple is
 *     a total order — Prisma's cursor on enterprise_id walks correctly).
 */
export function keysetArgs(cursor?: string, take?: number) {
  return {
    orderBy: [
      { uniqueQcImages: { sort: "desc" as const, nulls: "last" as const } },
      { enterpriseId: "asc" as const },
    ],
    take: take ?? 50,
    ...(cursor ? { skip: 1, cursor: { enterpriseId: cursor } } : {}),
  };
}
