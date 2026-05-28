import "server-only";
import { prisma } from "@/lib/db";
import { buildAuditWhere, type AuditFilter } from "@/lib/audit-query";
import type { AuditLog } from "@prisma/client";

const EXPORT_BATCH_SIZE = 1000;

export interface AuditRowWithName extends AuditLog {
  enterpriseName: string | null;
}

export interface AuditFeedPage {
  rows: AuditRowWithName[];
  nextCursor: string | null;
  total: number;
}

/** One page of the audit feed, joined with each enterprise's current name. */
export async function getAuditFeed(filter: AuditFilter): Promise<AuditFeedPage> {
  const where = buildAuditWhere(filter);
  const take = filter.take ?? 50;

  const [rowsRaw, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(filter.cursor
        ? { skip: 1, cursor: { id: filter.cursor } }
        : {}),
    }),
    prisma.auditLog.count({ where }),
  ]);

  let nextCursor: string | null = null;
  if (rowsRaw.length > take) {
    rowsRaw.pop();
    nextCursor = rowsRaw[rowsRaw.length - 1]?.id ?? null;
  }

  const rows = await attachEnterpriseNames(rowsRaw);
  return { rows, nextCursor, total };
}

/**
 * Async-iterate the audit log matching a filter, in keyset-paged batches, each
 * already joined with the enterprise name. Drives the streamed CSV/JSON/XLSX
 * exports — memory stays flat regardless of total size.
 */
export async function* iterateAudit(
  filter: AuditFilter,
): AsyncGenerator<AuditRowWithName> {
  const where = buildAuditWhere(filter);
  let cursor: string | undefined;

  for (;;) {
    const batch: AuditLog[] = await prisma.auditLog.findMany({
      where,
      orderBy: { id: "asc" }, // stable order for cursor — different from feed page sort
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) return;
    const joined = await attachEnterpriseNames(batch);
    for (const r of joined) yield r;
    if (batch.length < EXPORT_BATCH_SIZE) return;
    cursor = batch[batch.length - 1].id;
  }
}

/**
 * Join in each row's current enterprise_name with a single Prisma round-trip,
 * rather than a relation FK. Audit survives independently of pending_record
 * (which we never delete anyway), so the join is loose and tolerant of misses.
 */
async function attachEnterpriseNames(
  rows: AuditLog[],
): Promise<AuditRowWithName[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.enterpriseId)));
  const names = await prisma.pendingRecord.findMany({
    where: { enterpriseId: { in: ids } },
    select: { enterpriseId: true, enterpriseName: true },
  });
  const byId = new Map(names.map((n) => [n.enterpriseId, n.enterpriseName]));
  return rows.map((r) => ({
    ...r,
    enterpriseName: byId.get(r.enterpriseId) ?? null,
  }));
}
