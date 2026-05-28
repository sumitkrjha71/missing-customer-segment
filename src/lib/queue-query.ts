import type { Prisma } from "@prisma/client";
import type { QueueFilter } from "@/lib/validate";

/**
 * Build the Prisma `where` for the queue from validated filters. Shared by the
 * queue list API and every export route so a filtered export matches exactly
 * what the user sees on screen.
 *
 * All predicates hit indexed columns (status, csm_email, first_seen_at).
 */
export function buildQueueWhere(f: QueueFilter): Prisma.PendingRecordWhereInput {
  const where: Prisma.PendingRecordWhereInput = { status: f.status };

  // Sentinel: csm=__none__ filters to records where csmEmail IS NULL (so the
  // "Unassigned CSM" group can fetch its own page like every other group).
  if (f.csm === "__none__") {
    where.csmEmail = null;
  } else if (f.csm) {
    where.csmEmail = f.csm.toLowerCase();
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
