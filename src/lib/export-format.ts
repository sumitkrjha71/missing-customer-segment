import type { PendingRecord } from "@prisma/client";

/** Canonical export column order, shared across CSV / JSON / XLSX. */
export const EXPORT_COLUMNS = [
  "enterprise_id",
  "enterprise_name",
  "segment",
  "account_status",
  "stage",
  "status",
  "csm_name",
  "csm_email",
  "unique_qc_images",
  "last_received_at",
  "resolved_by",
  "resolved_at",
  "first_seen_at",
  "source_updated_at",
] as const;

export type ExportRow = Record<(typeof EXPORT_COLUMNS)[number], string | number | null>;

export function toExportRow(r: PendingRecord): ExportRow {
  return {
    enterprise_id: r.enterpriseId,
    enterprise_name: r.enterpriseName,
    segment: r.segment,
    account_status: r.accountStatus,
    stage: r.stage,
    status: r.status,
    csm_name: r.csmName,
    csm_email: r.csmEmail,
    unique_qc_images: r.uniqueQcImages,
    last_received_at: r.lastImageReceivedAt ? r.lastImageReceivedAt.toISOString() : null,
    resolved_by: r.resolvedBy,
    resolved_at: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    first_seen_at: r.firstSeenAt.toISOString(),
    source_updated_at: r.sourceUpdatedAt ? r.sourceUpdatedAt.toISOString() : null,
  };
}

/** RFC-4180 CSV field escaping. */
export function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvHeaderLine(): string {
  return EXPORT_COLUMNS.join(",") + "\n";
}

export function csvLine(row: ExportRow): string {
  return EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(",") + "\n";
}

/** Build a safe, timestamped filename for a download. */
export function exportFilename(ext: string, scope?: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const tag = scope ? `-${scope.replace(/[^a-z0-9]+/gi, "_")}` : "";
  return `segments${tag}-${stamp}.${ext}`;
}
