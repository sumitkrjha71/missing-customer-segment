/**
 * One-off admin script: revert mistakenly-assigned RESOLVED records back to PENDING.
 *
 * For each enterprise:
 *   - Verify it's currently RESOLVED.
 *   - In a single transaction:
 *       - Set status=PENDING, segment=NULL, resolvedAt=NULL, resolvedBy=NULL,
 *         version=version+1 (so any in-flight UI CAS will safely fail).
 *       - Insert an audit row (action='UNRESOLVE') preserving the prior segment.
 *
 * The original ASSIGN audit row is untouched — the trail shows: ASSIGN → UNRESOLVE.
 *
 * Run:  npx tsx scripts/unresolve.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const ENTERPRISE_IDS = ["050bc82f3", "8a9c4207d"];
const ACTOR = "sumit.jha@spyne.ai";

const prisma = new PrismaClient();

async function main() {
  for (const id of ENTERPRISE_IDS) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const before = await tx.pendingRecord.findUnique({
          where: { enterpriseId: id },
          select: {
            segment: true,
            status: true,
            version: true,
            resolvedBy: true,
            accountStatus: true,
          },
        });
        if (!before) return { ok: false as const, reason: "NOT_FOUND" };
        if (before.status !== "RESOLVED")
          return { ok: false as const, reason: `STATUS_${before.status}` };

        await tx.pendingRecord.update({
          where: { enterpriseId: id },
          data: {
            status: "PENDING",
            segment: null,
            resolvedAt: null,
            resolvedBy: null,
            version: { increment: 1 },
          },
        });

        await tx.auditLog.create({
          data: {
            enterpriseId: id,
            action: "UNRESOLVE",
            fromSegment: before.segment,
            toSegment: null,
            actorEmail: ACTOR,
            idempotencyKey: randomUUID(),
          },
        });

        return { ok: true as const, fromSegment: before.segment };
      });

      if (result.ok) {
        console.log(`OK   ${id}: was ${result.fromSegment} → reverted to PENDING`);
      } else {
        console.log(`SKIP ${id}: ${result.reason}`);
      }
    } catch (e) {
      console.error(`FAIL ${id}:`, e);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
