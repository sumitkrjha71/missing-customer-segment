import type { AuditLog } from "@prisma/client";
import { csvCell } from "@/lib/export-format";

/** Column order for audit exports. */
export const AUDIT_EXPORT_COLUMNS = [
  "created_at",
  "enterprise_id",
  "enterprise_name",
  "action",
  "from_segment",
  "to_segment",
  "from_status",
  "to_status",
  "from_csm_email",
  "to_csm_email",
  "actor_email",
  "idempotency_key",
] as const;

export type AuditExportRow = Record<
  (typeof AUDIT_EXPORT_COLUMNS)[number],
  string | null
>;

/** Convert an AuditLog row + (optional) joined enterprise name into export shape. */
export function toAuditExportRow(
  a: AuditLog,
  enterpriseName: string | null | undefined,
): AuditExportRow {
  return {
    created_at: a.createdAt.toISOString(),
    enterprise_id: a.enterpriseId,
    enterprise_name: enterpriseName ?? null,
    action: a.action,
    from_segment: a.fromSegment,
    to_segment: a.toSegment,
    from_status: a.fromStatus,
    to_status: a.toStatus,
    from_csm_email: a.fromCsmEmail,
    to_csm_email: a.toCsmEmail,
    actor_email: a.actorEmail,
    idempotency_key: a.idempotencyKey,
  };
}

export function auditCsvHeaderLine(): string {
  return AUDIT_EXPORT_COLUMNS.join(",") + "\n";
}

export function auditCsvLine(row: AuditExportRow): string {
  return AUDIT_EXPORT_COLUMNS.map((c) => csvCell(row[c])).join(",") + "\n";
}
