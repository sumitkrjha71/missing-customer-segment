/**
 * Manually run one ingestion sync (same code path as the cron / /api/sync).
 * Writes to the DB in DATABASE_URL using the question in METABASE_QUESTION_URL.
 * Safe: the upsert never resurrects RESOLVED rows and only refreshes mirror cols.
 * Run: npx tsx scripts/run-sync.ts
 */
import { runSync } from "../src/server/sync";

async function main() {
  const outcome = await runSync();
  console.log("sync outcome:", outcome);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
