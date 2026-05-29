/**
 * Seed local dev data so the dashboard is usable before the Metabase
 * URL is wired in. Safe to run repeatedly (uses upsert on the natural key).
 *
 *   npm run db:seed
 */
import { PrismaClient, RecordStatus } from "@prisma/client";

const prisma = new PrismaClient();

const CSMS = [
  { name: "Aarav Mehta", email: "aarav.mehta@spyne.ai" },
  { name: "Priya Nair", email: "priya.nair@spyne.ai" },
  { name: "Rohan Gupta", email: "rohan.gupta@spyne.ai" },
  { name: "Unassigned", email: null as string | null },
];

const NAMES = [
  "Velocity Motors", "Apex Auto Group", "Skyline Dealerships", "Prime Wheels",
  "Continental Cars", "Summit Automotive", "Harbor Auto", "Crestview Motors",
  "Pioneer Vehicles", "Granite Auto", "Lakeside Cars", "Ironclad Motors",
  "Beacon Auto Group", "Northstar Dealers", "Cedar Auto", "Vanguard Wheels",
];

// Sample lifecycle stages — STAGE is the primary grouping/filter dimension.
// One entry is null so the "No stage" group is exercised locally too.
const STAGES = ["Onboarding", "Live", "Trial", "At Risk", null];

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Seeding pending_record …");
  let i = 0;
  for (const name of NAMES) {
    const csm = CSMS[i % CSMS.length];
    const isNull = i % 2 === 0; // alternate NULL vs 'unassigned' source state
    const ageDays = (i * 1.7) % 12; // spread aging across the green/amber/red bands
    const firstSeen = daysAgo(ageDays);
    const enterpriseId = `ent_${1000 + i}`;

    await prisma.pendingRecord.upsert({
      where: { enterpriseId },
      // Never resurrect a locally-resolved row, even when re-seeding.
      update: {},
      create: {
        enterpriseId,
        enterpriseName: name,
        csmName: csm.name === "Unassigned" ? null : csm.name,
        csmEmail: csm.email,
        accountStatus: "active",
        stage: STAGES[i % STAGES.length],
        // Half the rows had no segment at all (NULL); half were 'unassigned'.
        sourceSegment: isNull ? null : "unassigned",
        segment: null,
        sourceCreatedAt: daysAgo(ageDays + 30),
        sourceUpdatedAt: firstSeen,
        status: RecordStatus.PENDING,
        firstSeenAt: firstSeen,
        lastSeenAt: new Date(),
      },
    });
    i++;
  }

  // A couple of already-resolved rows so the export view has content.
  await prisma.pendingRecord.upsert({
    where: { enterpriseId: "ent_2001" },
    update: {},
    create: {
      enterpriseId: "ent_2001",
      enterpriseName: "Resolved Example Co",
      csmName: "Aarav Mehta",
      csmEmail: "aarav.mehta@spyne.ai",
      accountStatus: "active",
      stage: "Live",
      segment: "ENT",
      status: RecordStatus.RESOLVED,
      resolvedAt: daysAgo(1),
      resolvedBy: "aarav.mehta@spyne.ai",
      firstSeenAt: daysAgo(5),
      lastSeenAt: daysAgo(2),
    },
  });

  const total = await prisma.pendingRecord.count();
  console.log(`Done. pending_record now holds ${total} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
