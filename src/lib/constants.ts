/** Shared constants and small domain helpers. */

export const SEGMENTS = ["ENT", "Mid", "SMB"] as const;
export type Segment = (typeof SEGMENTS)[number];

export function isSegment(v: unknown): v is Segment {
  return typeof v === "string" && (SEGMENTS as readonly string[]).includes(v);
}

/** Default page size for the queue (keyset pagination). */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** Batch size when streaming/paging the DB for exports. */
export const EXPORT_BATCH_SIZE = 1000;
