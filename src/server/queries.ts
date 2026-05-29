import "server-only";
import { prisma } from "@/lib/db";
import { buildQueueWhere, keysetArgs } from "@/lib/queue-query";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { QueueFilter } from "@/lib/validate";
import type { PendingRecord } from "@prisma/client";

export interface QueuePage {
  rows: PendingRecord[];
  nextCursor: string | null;
  total: number; // total matching the filter (for "showing X of N")
}

/** One page of the queue for the given filter, plus the total match count. */
export async function getQueuePage(filter: QueueFilter): Promise<QueuePage> {
  const where = buildQueueWhere(filter);
  const take = filter.take ?? DEFAULT_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    prisma.pendingRecord.findMany({
      where,
      ...keysetArgs(filter.cursor, take + 1), // fetch one extra to detect "more"
    }),
    prisma.pendingRecord.count({ where }),
  ]);

  let nextCursor: string | null = null;
  if (rows.length > take) {
    rows.pop(); // drop the lookahead row; there is another page after this one
    nextCursor = rows[rows.length - 1]?.enterpriseId ?? null;
  }

  return { rows, nextCursor, total };
}

export interface DashboardSummary {
  totalPending: number;
  nullSegment: number; // never had a segment value in source
  unassigned: number; // source said 'unassigned'
  stageCount: number; // distinct (non-null) stages with a backlog
  perStage: { stage: string | null; count: number }[];
  lastSync: {
    finishedAt: Date | null;
    status: string;
    rowsUpserted: number;
  } | null;
}

/** Metric cards + per-stage grouping for the home dashboard. */
export async function getSummary(): Promise<DashboardSummary> {
  const pendingWhere = { status: "PENDING" as const };

  const [totalPending, grouped, lastSync] = await Promise.all([
    prisma.pendingRecord.count({ where: pendingWhere }),
    prisma.pendingRecord.groupBy({
      by: ["stage"],
      where: pendingWhere,
      _count: { _all: true },
      orderBy: { _count: { stage: "desc" } },
    }),
    prisma.syncRun.findFirst({
      where: { status: { in: ["SUCCESS", "FAILED"] } },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true, status: true, rowsUpserted: true },
    }),
  ]);

  // NULL vs 'unassigned' breakdown of the SOURCE customer_segment value.
  const unassigned = await prisma.pendingRecord.count({
    where: { ...pendingWhere, sourceSegment: { equals: "unassigned", mode: "insensitive" } },
  });

  const perStage = grouped.map((g) => ({
    stage: g.stage,
    count: g._count._all,
  }));

  return {
    totalPending,
    nullSegment: totalPending - unassigned,
    unassigned,
    stageCount: perStage.filter((s) => s.stage).length,
    perStage,
    lastSync,
  };
}

export async function getRecord(enterpriseId: string): Promise<PendingRecord | null> {
  return prisma.pendingRecord.findUnique({ where: { enterpriseId } });
}

export async function getAuditForEnterprise(enterpriseId: string) {
  return prisma.auditLog.findMany({
    where: { enterpriseId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
