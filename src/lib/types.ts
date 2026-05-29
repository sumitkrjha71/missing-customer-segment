/** Client-facing shape of a queue row (as returned by /api/queue). */
export interface QueueRow {
  enterpriseId: string;
  enterpriseName: string | null;
  csmName: string | null;
  csmEmail: string | null;
  accountStatus: string | null;
  stage: string | null;
  segment: string | null;
  status: "PENDING" | "RESOLVED";
  version: number;
  uniqueQcImages: number | null;
  lastImageReceivedAt: string | null;
  firstSeenAt: string;
  sourceUpdatedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export interface QueueResponse {
  ok: boolean;
  total: number;
  nextCursor: string | null;
  rows: QueueRow[];
}
