/**
 * Read-only diagnostic: why isn't the dashboard grouping by stage?
 * Checks (1) the stage column exists, (2) the stage value distribution,
 * (3) the last sync run.  Run: npx tsx scripts/diag-stage.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Does the column exist in prod? (did migration 0002 run?)
  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'pending_record' AND column_name = 'stage'
  `;
  console.log("stage column present:", cols.length > 0);

  if (cols.length === 0) {
    console.log("=> migration 0002_add_stage has NOT been applied to this DB.");
    await prisma.$disconnect();
    return;
  }

  // 2) Distribution of stage among PENDING rows.
  const pendingByStage = await prisma.pendingRecord.groupBy({
    by: ["stage"],
    where: { status: "PENDING" },
    _count: { _all: true },
    orderBy: { _count: { stage: "desc" } },
  });
  const totalPending = await prisma.pendingRecord.count({ where: { status: "PENDING" } });
  console.log(`\nPENDING total: ${totalPending}`);
  console.log("PENDING by stage:");
  for (const g of pendingByStage) {
    console.log(`  ${JSON.stringify(g.stage)} -> ${g._count._all}`);
  }

  // 3) Last sync run.
  const lastSync = await prisma.syncRun.findFirst({
    where: { status: { in: ["SUCCESS", "FAILED"] } },
    orderBy: { startedAt: "desc" },
  });
  console.log("\nLast sync:", lastSync
    ? { status: lastSync.status, finishedAt: lastSync.finishedAt, rowsUpserted: lastSync.rowsUpserted, rowsInvalid: lastSync.rowsInvalid, error: lastSync.error }
    : "none");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
