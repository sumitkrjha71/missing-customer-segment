/**
 * Read-only dry run of the real ingestion pipeline (fetch + validate + normalize).
 * Does NOT write to the database. Confirms enterprise_id + stage map correctly.
 * Run: npx tsx scripts/diag-dryrun.ts
 */
import { fetchPendingRows } from "../src/lib/metabase";

function mask(email: string | null): string | null {
  if (!email) return email;
  const [u, d] = email.split("@");
  return d ? `${u.slice(0, 2)}***@${d}` : "***";
}

async function main() {
  const { rows, fetched, invalid } = await fetchPendingRows();
  console.log(`fetched=${fetched}  valid=${rows.length}  invalid=${invalid}\n`);

  const withStage = rows.filter((r) => r.stage != null).length;
  const missingId = rows.filter((r) => !r.enterpriseId || r.enterpriseId === "undefined").length;
  console.log(`rows with non-null stage: ${withStage}/${rows.length}`);
  console.log(`rows with missing/undefined enterpriseId: ${missingId}`);

  // Distinct stage values seen (the eventual dashboard groups).
  const stageCounts = new Map<string, number>();
  for (const r of rows) {
    const k = r.stage ?? "(null)";
    stageCounts.set(k, (stageCounts.get(k) ?? 0) + 1);
  }
  console.log("\nstage distribution:");
  for (const [k, v] of [...stageCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${JSON.stringify(k)} -> ${v}`);
  }

  console.log("\nsample normalized rows:");
  for (const r of rows.slice(0, 3)) {
    console.log({
      enterpriseId: r.enterpriseId,
      stage: r.stage,
      uniqueQcImages: r.uniqueQcImages,
      csmEmail: mask(r.csmEmail),
      lastImageReceivedAt: r.lastImageReceivedAt,
    });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
