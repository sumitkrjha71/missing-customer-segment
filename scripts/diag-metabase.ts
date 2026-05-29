/**
 * Read-only: inspect the live Metabase CSV header + find which column holds the
 * stage values. Prints column names only (no full customer rows).
 * Run: npx tsx scripts/diag-metabase.ts
 */
const STAGE_VALUES = new Set(
  ["New", "Contract-Initiated", "Churned", "Drop-Off", "Live", "Contracted"].map((s) => s.toLowerCase()),
);

async function main() {
  const url = process.env.METABASE_QUESTION_URL!;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    console.log("Empty/short CSV:", lines.length, "lines");
    return;
  }

  // Naive split is fine for header inspection (header names rarely contain commas).
  const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  console.log(`Columns (${header.length}):`);
  header.forEach((h, i) => console.log(`  [${i}] ${JSON.stringify(h)}`));

  // Scan the first ~500 data rows to find which column index holds stage values.
  const hits: Record<number, number> = {};
  const sample = lines.slice(1, 501);
  for (const line of sample) {
    const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    cells.forEach((c, i) => {
      if (c && STAGE_VALUES.has(c.toLowerCase())) hits[i] = (hits[i] ?? 0) + 1;
    });
  }
  console.log("\nColumns whose values match known stages (index -> matchCount in first 500 rows):");
  for (const [idx, count] of Object.entries(hits).sort((a, b) => b[1] - a[1])) {
    console.log(`  [${idx}] header=${JSON.stringify(header[Number(idx)])} -> ${count}`);
  }
  if (Object.keys(hits).length === 0) {
    console.log("  (none matched — stage values may be formatted differently)");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
