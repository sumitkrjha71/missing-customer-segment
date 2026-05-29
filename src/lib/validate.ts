import { z } from "zod";
import { SEGMENTS } from "@/lib/constants";

/**
 * One raw row as returned by the Metabase question JSON. We accept either the
 * documented snake_case shape or common camelCase variants, coerce loose types,
 * and tolerate missing optional fields. Required: a non-empty enterprise_id.
 *
 * Invalid rows are skipped (counted in sync_run.rowsInvalid), never fatal.
 */
const looseDate = z
  .union([z.string(), z.number(), z.date()])
  .nullish()
  .transform((v) => {
    if (v == null || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const looseString = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === "" ? null : String(v)));

export const metabaseRowSchema = z
  .object({
    enterprise_id: z.union([z.string(), z.number()]),
    enterpriseId: z.union([z.string(), z.number()]).optional(),

    enterprise_name: looseString,
    enterpriseName: looseString.optional(),

    customer_segment: looseString,
    csm_name: looseString,
    csmName: looseString.optional(),
    csm_email: looseString,
    csmEmail: looseString.optional(),
    account_status: looseString,
    accountStatus: looseString.optional(),

    // Enterprise lifecycle stage — the primary grouping/filter dimension.
    stage: looseString,

    // When the most recent QC image was received for this enterprise.
    last_received_at: looseDate,

    // QC signal — the default sort everywhere. Coerced to int; non-numeric → null.
    // Tolerant of formatted-number strings ("25,000", " 25 000 ", "25000.0"):
    // strip thousands separators and whitespace before parsing.
    unique_qc_images: z
      .union([z.string(), z.number()])
      .nullish()
      .transform((v) => {
        if (v == null || v === "") return null;
        if (typeof v === "number") {
          return Number.isFinite(v) ? Math.trunc(v) : null;
        }
        const cleaned = String(v).replace(/[,\s]/g, "");
        if (cleaned === "") return null;
        const n = Number(cleaned);
        return Number.isFinite(n) ? Math.trunc(n) : null;
      }),

    created_at: looseDate,
    createdAt: looseDate.optional(),
    updated_at: looseDate,
    updatedAt: looseDate.optional(),
  })
  .passthrough()
  .transform((r) => ({
    enterpriseId: String(r.enterpriseId ?? r.enterprise_id).trim(),
    enterpriseName: r.enterpriseName ?? r.enterprise_name ?? null,
    csmName: r.csmName ?? r.csm_name ?? null,
    csmEmail: (r.csmEmail ?? r.csm_email ?? null)?.toLowerCase() ?? null,
    accountStatus: r.accountStatus ?? r.account_status ?? null,
    stage: r.stage ?? null,
    // Raw source segment, preserved so we can report NULL vs 'unassigned'.
    sourceSegment: r.customer_segment ?? null,
    uniqueQcImages: r.unique_qc_images ?? null,
    lastImageReceivedAt: r.last_received_at ?? null,
    sourceCreatedAt: r.createdAt ?? r.created_at ?? null,
    sourceUpdatedAt: r.updatedAt ?? r.updated_at ?? null,
  }))
  .refine((r) => r.enterpriseId.length > 0, {
    message: "enterprise_id is required",
  });

export type NormalizedRow = z.infer<typeof metabaseRowSchema>;

/** Server Action input: assign a segment. */
export const assignInputSchema = z.object({
  enterpriseId: z.string().min(1),
  segment: z.enum(SEGMENTS),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
});
export type AssignInput = z.infer<typeof assignInputSchema>;

/** Server Action input: mark churned. */
export const churnInputSchema = z.object({
  enterpriseId: z.string().min(1),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
});
export type ChurnInput = z.infer<typeof churnInputSchema>;

/**
 * Server Action input: assign a CSM to a live, currently-unassigned account.
 * This does NOT resolve the record — it stays in the PENDING queue under the
 * newly-assigned CSM, so they can then classify its segment.
 */
export const assignCsmInputSchema = z.object({
  enterpriseId: z.string().min(1),
  csmEmail: z.string().trim().toLowerCase().email(),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
});
export type AssignCsmInput = z.infer<typeof assignCsmInputSchema>;

/** Server Action input: reassign the segment of an already-resolved record. */
export const reassignInputSchema = z.object({
  enterpriseId: z.string().min(1),
  segment: z.enum(SEGMENTS),
  expectedVersion: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
});
export type ReassignInput = z.infer<typeof reassignInputSchema>;

/** Query params shared by the queue list and the export routes. */
export const queueFilterSchema = z.object({
  status: z.enum(["PENDING", "RESOLVED"]).default("PENDING"),
  stage: z.string().trim().optional(), // exact stage filter; "__none__" = NULL stage
  q: z.string().trim().optional(), // free-text search (name/email)
  segment: z.enum(SEGMENTS).optional(), // resolved-segment filter
  // Last-image-received-at date range. Inclusive on both ends. Either side
  // optional; setting any side also excludes records with NULL last_received_at.
  // Strings come from native <input type="date"> as YYYY-MM-DD.
  lastReceivedFrom: z.coerce.date().optional(),
  lastReceivedTo: z.coerce.date().optional(),
  cursor: z.string().optional(), // keyset cursor = last enterpriseId
  take: z.coerce.number().int().min(1).max(200).optional(),
});
export type QueueFilter = z.infer<typeof queueFilterSchema>;
