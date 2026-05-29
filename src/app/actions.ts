"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/rbac";
import {
  assignInputSchema,
  churnInputSchema,
  assignCsmInputSchema,
  reassignInputSchema,
  type AssignInput,
  type ChurnInput,
  type AssignCsmInput,
  type ReassignInput,
} from "@/lib/validate";
import {
  IdempotentReplayError,
  StaleWriteError,
  isUniqueViolation,
} from "@/lib/errors";
import { log } from "@/lib/logger";

/**
 * Result returned to the client. Discriminated so the UI can react precisely:
 *  - ok:true            → applied (or idempotent replay of a prior apply)
 *  - reason:'STALE'     → someone else changed it; UI refreshes + informs
 *  - reason:'NOT_FOUND' → record gone
 *  - reason:'VALIDATION'/'AUTH'/'ERROR'
 */
export type MutationResult =
  | { ok: true; replay?: boolean; record: PublicRecord }
  | {
      ok: false;
      reason: "STALE";
      current: {
        version: number;
        status: string;
        segment: string | null;
        resolvedBy: string | null;
      } | null;
    }
  | { ok: false; reason: "NOT_FOUND" | "VALIDATION" | "AUTH" | "ERROR"; message?: string };

export interface PublicRecord {
  enterpriseId: string;
  status: string;
  segment: string | null;
  version: number;
  accountStatus: string | null;
}

/** Assign ENT / Mid / SMB to a pending record. */
export async function assignSegment(input: AssignInput): Promise<MutationResult> {
  return resolveRecord("ASSIGN", input);
}

/** Mark a record as churned (UI requires a double-confirm before calling). */
export async function markChurned(input: ChurnInput): Promise<MutationResult> {
  return resolveRecord("CHURN", input);
}

/**
 * Assign a CSM email to a live, currently-unassigned record.
 *
 * Unlike assign/churn, this does NOT resolve the record. It stays PENDING so
 * the newly-assigned CSM can then classify its segment. We still apply all four
 * reliability guarantees: optimistic CAS on version, append-only audit, single
 * transaction, idempotent on the supplied key.
 *
 * Guarded:
 *   - record must be PENDING
 *   - account_status must NOT be 'churned' (server-side reaffirmation of the UI rule)
 *   - csm_email on the record must currently be NULL (no overwrites here)
 */
export async function assignCsm(rawInput: AssignCsmInput): Promise<MutationResult> {
  let actorEmail: string;
  try {
    const actor = await requireActor();
    actorEmail = actor.email;
  } catch {
    return { ok: false, reason: "AUTH" };
  }

  const parsed = assignCsmInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "VALIDATION", message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const before = await tx.pendingRecord.findUnique({
        where: { enterpriseId: input.enterpriseId },
        select: { csmEmail: true, accountStatus: true, status: true },
      });
      if (!before) throw new RecordNotFound();
      if (before.status !== "PENDING")
        throw new StaleWriteError({
          version: 0,
          status: before.status,
          segment: null,
          resolvedBy: null,
        });
      if ((before.accountStatus ?? "").toLowerCase() === "churned") {
        throw new ForbiddenAction("Account is churned");
      }
      if (before.csmEmail) {
        // Refuse to overwrite — this action is for filling in a missing CSM,
        // not for reassigning an existing one.
        throw new ForbiddenAction("CSM already assigned");
      }

      const updated = await tx.pendingRecord.updateMany({
        where: {
          enterpriseId: input.enterpriseId,
          version: input.expectedVersion,
          status: "PENDING",
          csmEmail: null,
        },
        data: {
          csmEmail: input.csmEmail,
          version: { increment: 1 },
          // NB: status stays PENDING; resolvedAt/resolvedBy untouched.
        },
      });

      if (updated.count === 0) {
        const current = await tx.pendingRecord.findUnique({
          where: { enterpriseId: input.enterpriseId },
          select: { version: true, status: true, segment: true, resolvedBy: true },
        });
        throw new StaleWriteError(current);
      }

      try {
        await tx.auditLog.create({
          data: {
            enterpriseId: input.enterpriseId,
            action: "ASSIGN_CSM",
            fromCsmEmail: before.csmEmail,
            toCsmEmail: input.csmEmail,
            actorEmail,
            idempotencyKey: input.idempotencyKey,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new IdempotentReplayError();
        throw e;
      }

      const after = await tx.pendingRecord.findUniqueOrThrow({
        where: { enterpriseId: input.enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      return after;
    });

    log.info("mutation.csm_assigned", {
      enterpriseId: input.enterpriseId,
      actorEmail,
      toCsmEmail: input.csmEmail,
    });
    revalidatePath("/");
    revalidatePath(`/queue/${input.enterpriseId}`);
    return { ok: true, record };
  } catch (err) {
    if (err instanceof StaleWriteError) {
      return { ok: false, reason: "STALE", current: err.current };
    }
    if (err instanceof IdempotentReplayError) {
      const current = await prisma.pendingRecord.findUnique({
        where: { enterpriseId: input.enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      revalidatePath("/");
      return current
        ? { ok: true, replay: true, record: current }
        : { ok: false, reason: "NOT_FOUND" };
    }
    if (err instanceof RecordNotFound) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    if (err instanceof ForbiddenAction) {
      return { ok: false, reason: "ERROR", message: err.message };
    }
    log.error("mutation.csm_assign.error", {
      enterpriseId: input.enterpriseId,
      error: String(err),
    });
    return { ok: false, reason: "ERROR", message: "Unexpected error" };
  }
}

/**
 * Shared transactional resolver. Implements all four reliability guarantees:
 *
 *  1. No resurrection  — only acts on a row that is still PENDING.
 *  2. No lost updates  — optimistic CAS on `version`; 0 rows updated ⇒ STALE.
 *  3. No double-writes — AuditLog.idempotencyKey is unique; a replay is a no-op.
 *  4. No silent change — the audit row is written in the SAME transaction.
 */
async function resolveRecord(
  action: "ASSIGN" | "CHURN",
  raw: unknown,
): Promise<MutationResult> {
  // --- auth ---
  let actorEmail: string;
  try {
    const actor = await requireActor();
    actorEmail = actor.email;
  } catch {
    return { ok: false, reason: "AUTH" };
  }

  // --- validate ---
  const schema = action === "ASSIGN" ? assignInputSchema : churnInputSchema;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: "VALIDATION", message: parsed.error.message };
  }
  const input = parsed.data as AssignInput & ChurnInput;
  const segment = action === "ASSIGN" ? (input as AssignInput).segment : null;

  try {
    const record = await prisma.$transaction(async (tx) => {
      // Read current state first (for a precise audit "from" + good conflict msg).
      const before = await tx.pendingRecord.findUnique({
        where: { enterpriseId: input.enterpriseId },
        select: { segment: true, accountStatus: true },
      });
      if (!before) throw new RecordNotFound();

      // (2) Compare-and-swap: only a row at the expected version AND still
      // PENDING is updated. Anything else updates 0 rows → conflict.
      const updated = await tx.pendingRecord.updateMany({
        where: {
          enterpriseId: input.enterpriseId,
          version: input.expectedVersion,
          status: "PENDING", // (1) never re-resolve / resurrect
        },
        data: {
          status: "RESOLVED",
          version: { increment: 1 },
          resolvedAt: new Date(),
          resolvedBy: actorEmail,
          ...(action === "ASSIGN"
            ? { segment }
            : { accountStatus: "churned" }),
        },
      });

      if (updated.count === 0) {
        const current = await tx.pendingRecord.findUnique({
          where: { enterpriseId: input.enterpriseId },
          select: { version: true, status: true, segment: true, resolvedBy: true },
        });
        throw new StaleWriteError(current);
      }

      // (4) Audit in the same transaction. (3) Unique idempotencyKey makes a
      // double-click/retry throw P2002, which we treat as a successful replay.
      try {
        await tx.auditLog.create({
          data: {
            enterpriseId: input.enterpriseId,
            action,
            fromSegment: before.segment,
            toSegment: segment,
            fromStatus: before.accountStatus,
            toStatus: action === "CHURN" ? "churned" : before.accountStatus,
            actorEmail,
            idempotencyKey: input.idempotencyKey,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new IdempotentReplayError();
        throw e;
      }

      const after = await tx.pendingRecord.findUniqueOrThrow({
        where: { enterpriseId: input.enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      return after;
    });

    log.info("mutation.applied", {
      action,
      enterpriseId: input.enterpriseId,
      actorEmail,
      segment,
    });
    revalidatePath("/");
    revalidatePath(`/queue/${input.enterpriseId}`);
    return { ok: true, record };
  } catch (err) {
    if (err instanceof StaleWriteError) {
      log.warn("mutation.stale", { action, enterpriseId: input.enterpriseId, actorEmail });
      return { ok: false, reason: "STALE", current: err.current };
    }
    if (err instanceof IdempotentReplayError) {
      // The original write already committed; return the current resolved state.
      const current = await prisma.pendingRecord.findUnique({
        where: { enterpriseId: input.enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      log.info("mutation.replay", { action, enterpriseId: input.enterpriseId });
      revalidatePath("/");
      return current
        ? { ok: true, replay: true, record: current }
        : { ok: false, reason: "NOT_FOUND" };
    }
    if (err instanceof RecordNotFound) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    log.error("mutation.error", {
      action,
      enterpriseId: input.enterpriseId,
      error: String(err),
    });
    return { ok: false, reason: "ERROR", message: "Unexpected error" };
  }
}

/**
 * Reassign the segment of an already-resolved record.
 * Keeps the record in RESOLVED state; only segment + audit trail change.
 */
export async function reassignSegment(rawInput: ReassignInput): Promise<MutationResult> {
  let actorEmail: string;
  try {
    const actor = await requireActor();
    actorEmail = actor.email;
  } catch {
    return { ok: false, reason: "AUTH" };
  }

  const parsed = reassignInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "VALIDATION", message: parsed.error.message };
  }
  const { enterpriseId, segment, expectedVersion, idempotencyKey } = parsed.data;

  try {
    const record = await prisma.$transaction(async (tx) => {
      const before = await tx.pendingRecord.findUnique({
        where: { enterpriseId },
        select: { segment: true },
      });
      if (!before) throw new RecordNotFound();

      const updated = await tx.pendingRecord.updateMany({
        where: { enterpriseId, version: expectedVersion, status: "RESOLVED" },
        data: {
          segment,
          version: { increment: 1 },
          resolvedAt: new Date(),
          resolvedBy: actorEmail,
        },
      });

      if (updated.count === 0) {
        const current = await tx.pendingRecord.findUnique({
          where: { enterpriseId },
          select: { version: true, status: true, segment: true, resolvedBy: true },
        });
        throw new StaleWriteError(current);
      }

      try {
        await tx.auditLog.create({
          data: {
            enterpriseId,
            action: "REASSIGN",
            fromSegment: before.segment,
            toSegment: segment,
            actorEmail,
            idempotencyKey,
          },
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new IdempotentReplayError();
        throw e;
      }

      const after = await tx.pendingRecord.findUniqueOrThrow({
        where: { enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      return after;
    });

    log.info("mutation.reassigned", { enterpriseId, actorEmail, segment });
    revalidatePath("/resolved");
    revalidatePath(`/queue/${enterpriseId}`);
    return { ok: true, record };
  } catch (err) {
    if (err instanceof StaleWriteError) {
      return { ok: false, reason: "STALE", current: err.current };
    }
    if (err instanceof IdempotentReplayError) {
      const current = await prisma.pendingRecord.findUnique({
        where: { enterpriseId },
        select: {
          enterpriseId: true,
          status: true,
          segment: true,
          version: true,
          accountStatus: true,
        },
      });
      revalidatePath("/resolved");
      return current
        ? { ok: true, replay: true, record: current }
        : { ok: false, reason: "NOT_FOUND" };
    }
    if (err instanceof RecordNotFound) {
      return { ok: false, reason: "NOT_FOUND" };
    }
    log.error("mutation.reassign.error", { enterpriseId, error: String(err) });
    return { ok: false, reason: "ERROR", message: "Unexpected error" };
  }
}

class RecordNotFound extends Error {}
class ForbiddenAction extends Error {}
