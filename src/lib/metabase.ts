import { log } from "@/lib/logger";
import { metabaseRowSchema, type NormalizedRow } from "@/lib/validate";

export interface FetchResult {
  rows: NormalizedRow[];
  fetched: number; // total rows received from Metabase
  invalid: number; // rows dropped by validation
}

/**
 * Fetch the Metabase public-question export and normalize it.
 *
 * Supports BOTH endpoints transparently — the URL's extension drives the
 * content type:
 *   • `/public/question/<uuid>.json` → capped at 2,000 rows by Metabase.
 *   • `/public/question/<uuid>.csv`  → capped at ~1,000,000 rows. RECOMMENDED.
 *
 * Reliability choices:
 *  - Bounded retry (default 2 retries, short backoff) so total time stays well
 *    under the serverless function budget. We never do long `sleep` backoff.
 *  - AbortSignal timeout per attempt.
 *  - Per-row validation: bad rows are skipped and counted, never fatal.
 */
export async function fetchPendingRows(opts?: {
  url?: string;
  retries?: number;
  timeoutMs?: number;
}): Promise<FetchResult> {
  const url = opts?.url ?? process.env.METABASE_QUESTION_URL;
  if (!url) throw new Error("METABASE_QUESTION_URL is not set");

  const retries = opts?.retries ?? 2;
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        // No Accept header — let the URL extension drive the content type.
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Metabase HTTP ${res.status}`);

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const text = await res.text();
      const raw = parseMetabaseBody(text, contentType, url);

      const rows: NormalizedRow[] = [];
      let invalid = 0;
      const invalidSamples: { issues: string; keys: string[] }[] = [];
      for (const r of raw) {
        const parsed = metabaseRowSchema.safeParse(r);
        if (parsed.success) {
          rows.push(parsed.data);
        } else {
          invalid++;
          // Capture the first few failures with their reasons + the row's
          // keys (NOT values) so the user can see what the parser tripped on
          // without exposing customer PII to the log.
          if (invalidSamples.length < 3) {
            invalidSamples.push({
              issues: parsed.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; "),
              keys:
                r && typeof r === "object" && !Array.isArray(r)
                  ? Object.keys(r as Record<string, unknown>)
                  : [],
            });
          }
        }
      }

      // Dedupe defensively on the natural key (last row wins).
      const byId = new Map<string, NormalizedRow>();
      for (const r of rows) byId.set(r.enterpriseId, r);
      const deduped = [...byId.values()];

      log.info("metabase.fetch.ok", {
        receivedRows: raw.length,
        validRows: rows.length,
        afterDedupe: deduped.length,
        invalidRows: invalid,
        invalidSamples,
      });

      return { rows: deduped, fetched: raw.length, invalid };
    } catch (err) {
      lastErr = err;
      log.warn("metabase.fetch.attempt_failed", {
        attempt,
        error: String(err),
      });
      if (attempt < retries) {
        await sleep(1000 * (attempt + 1)); // 1s, 2s — short, bounded
      }
    }
  }
  throw new Error(`Metabase fetch failed after ${retries + 1} attempts: ${String(lastErr)}`);
}

/**
 * Decide whether the response body is JSON or CSV and parse accordingly.
 * Detection precedence: explicit Content-Type → URL extension → first byte sniff.
 */
function parseMetabaseBody(
  text: string,
  contentType: string,
  url: string,
): unknown[] {
  // Strip a UTF-8 BOM up front so both branches see clean text.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const looksJson =
    contentType.includes("json") ||
    /\.json(\?|$)/i.test(url) ||
    /^\s*[\[{]/.test(text);

  if (looksJson) {
    const body = JSON.parse(text) as unknown;
    return extractRowsJson(body);
  }

  // CSV path — the recommended endpoint at scale (no 2,000-row cap).
  const objects = parseCsv(text);
  return objects.map(normalizeRow);
}

/**
 * Metabase JSON export is usually a top-level array of row objects, but some
 * cards/endpoints wrap rows under `data.rows` (+ `data.cols`). Handle both, and
 * normalize every key so display names map onto our canonical field names.
 */
function extractRowsJson(body: unknown): unknown[] {
  if (Array.isArray(body)) return body.map(normalizeRow);
  if (body && typeof body === "object" && "data" in body) {
    const data = (body as { data?: unknown }).data;
    if (data && typeof data === "object" && "rows" in data) {
      const { rows, cols } = data as {
        rows?: unknown[];
        cols?: { name?: string; display_name?: string }[];
      };
      if (Array.isArray(rows) && Array.isArray(cols)) {
        return rows.map((row) => {
          const obj: Record<string, unknown> = {};
          (row as unknown[]).forEach((v, i) => {
            const name = cols[i]?.name ?? cols[i]?.display_name;
            if (name) obj[canonicalKey(name)] = v;
          });
          return obj;
        });
      }
    }
  }
  return [];
}

/** Normalize the keys of one row object onto canonical snake_case field names. */
function normalizeRow(row: unknown): unknown {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    out[canonicalKey(k)] = v;
  }
  return out;
}

/**
 * Map a raw column name to our canonical field name. Lowercases and converts
 * any run of non-alphanumerics to "_", then applies a small alias table for the
 * common CSM/enterprise naming variants seen in Metabase questions.
 *
 * If the live question uses a column name not covered here, add it to ALIASES.
 */
const ALIASES: Record<string, string> = {
  // enterprise id
  id: "enterprise_id",
  enterpriseid: "enterprise_id",
  enterprise: "enterprise_id",
  account_id: "enterprise_id",
  company_id: "enterprise_id",
  qa_enterprise_id: "enterprise_id", // table-qualified "qa.enterprise_id" from the question
  // enterprise name
  name: "enterprise_name",
  company: "enterprise_name",
  company_name: "enterprise_name",
  account_name: "enterprise_name",
  enterprisename: "enterprise_name",
  // segment
  segment: "customer_segment",
  customersegment: "customer_segment",
  // csm email
  csmemail: "csm_email",
  poc_email: "csm_email",
  cs_poc_email: "csm_email",
  owner_email: "csm_email",
  account_manager_email: "csm_email",
  // csm name
  csmname: "csm_name",
  poc: "csm_name",
  poc_name: "csm_name",
  cs_poc: "csm_name",
  cs_poc_name: "csm_name",
  owner: "csm_name",
  account_manager: "csm_name",
  // status
  status: "account_status",
  accountstatus: "account_status",
  // stage — canonical "stage" maps as-is; these cover common naming variants
  // so a question column like "Account Stage" / "lifecycle_stage" still lands.
  enterprise_stage: "stage",
  account_stage: "stage",
  lifecycle_stage: "stage",
  customer_stage: "stage",
  cs_stage: "stage",
  deal_stage: "stage",
  // timestamps
  createdat: "created_at",
  updatedat: "updated_at",
  // last image received (QC)
  lastreceivedat: "last_received_at",
  last_image_received_at: "last_received_at",
  lastimagereceivedat: "last_received_at",
  last_image_received: "last_received_at",
  last_received: "last_received_at",
  // QC images (in case the metabase column ever lands without underscores)
  uniqueqcimages: "unique_qc_images",
};

function canonicalKey(raw: string): string {
  const snake = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ALIASES[snake] ?? snake;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Minimal RFC-4180 CSV parser. Handles quoted fields, escaped quotes (`""`),
 * embedded newlines/commas inside quotes, and CRLF/LF/CR line endings. Header
 * row → object keys. No dependency.
 *
 * (Avoiding papaparse keeps the bundle small and the behavior fully owned;
 * Metabase's CSV output is well-formed RFC-4180.)
 */
function parseCsv(text: string): Record<string, string>[] {
  if (!text) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (text[i + 1] === "\n") i++; // CRLF
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Trailing field/row when the file doesn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing empty rows.
  while (
    rows.length > 0 &&
    (rows[rows.length - 1].length === 0 ||
      (rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === ""))
  ) {
    rows.pop();
  }
  if (rows.length < 2) return []; // need at least a header + one data row

  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = r[i] ?? "";
    }
    return obj;
  });
}
