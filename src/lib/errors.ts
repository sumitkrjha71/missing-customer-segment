/** Domain errors used by the mutation transactions (see actions.ts). */

/** Optimistic-lock conflict: the record changed since the UI rendered it. */
export class StaleWriteError extends Error {
  constructor(
    public current: {
      version: number;
      status: string;
      segment: string | null;
      resolvedBy: string | null;
    } | null,
  ) {
    super("STALE_WRITE");
    this.name = "StaleWriteError";
  }
}

/** The exact same action (same idempotency key) was already applied. */
export class IdempotentReplayError extends Error {
  constructor() {
    super("IDEMPOTENT_REPLAY");
    this.name = "IdempotentReplayError";
  }
}

/** True for a Prisma unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
