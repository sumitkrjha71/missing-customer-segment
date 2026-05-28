"use client";

import { useMemo, useState } from "react";
import { markChurned } from "@/app/actions";
import type { QueueRow } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { Overlay } from "@/components/AssignDialog";

interface Props {
  record: QueueRow;
  onCancel: () => void;
  onChurned: (enterpriseId: string) => void;
  onStale?: () => void;
}

const CONFIRM_WORD = "CHURN";

/**
 * Churn is destructive and hard to reverse, so it requires TWO deliberate steps:
 *   1. Acknowledge the warning (this dialog appears only after "Mark as churned…").
 *   2. Type the word CHURN exactly, then press the destructive confirm button.
 * The confirm button is disabled until the typed text matches, and is never the
 * default focus.
 */
export function ChurnConfirmDialog({ record, onCancel, onChurned, onStale }: Props) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), [record.enterpriseId]);
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function confirm() {
    if (!armed) return;
    setBusy(true);
    try {
      const res = await markChurned({
        enterpriseId: record.enterpriseId,
        expectedVersion: record.version,
        idempotencyKey,
      });
      if (res.ok) {
        toast.push(
          "success",
          res.replay
            ? `${record.enterpriseName ?? record.enterpriseId} was already marked churned.`
            : `Marked ${record.enterpriseName ?? record.enterpriseId} as churned.`,
        );
        onChurned(record.enterpriseId);
      } else if (res.reason === "STALE") {
        const by = res.current?.resolvedBy;
        toast.push("info", `This record was just updated${by ? ` by ${by}` : ""}. Refreshing.`);
        onStale?.();
      } else if (res.reason === "AUTH") {
        toast.push("error", "Your session expired. Please sign in again.");
      } else {
        toast.push("error", "Couldn’t mark churned. Please try again.");
      }
    } catch {
      toast.push("error", "Network error. Your change was not applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={() => !busy && onCancel()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-red-100 text-danger">
            !
          </span>
          <h2 className="text-lg font-semibold text-ink">Mark account as churned</h2>
        </div>

        <p className="mt-3 text-sm text-ink">
          Are you sure you want to mark this account as churned?
        </p>
        <p className="mt-1 text-sm text-muted">
          <span className="font-medium text-ink">
            {record.enterpriseName ?? record.enterpriseId}
          </span>{" "}
          will be set to <span className="font-medium text-danger">churned</span> and
          removed from the pending queue. This is recorded in the audit log and is
          not meant to be undone here.
        </p>

        <label className="mt-4 block text-xs font-medium text-muted">
          Type <span className="font-mono font-semibold text-ink">{CONFIRM_WORD}</span> to confirm
        </label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && armed && confirm()}
          placeholder={CONFIRM_WORD}
          className="input mt-1 w-full font-mono tracking-widest"
          disabled={busy}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!armed || busy}
            className="btn-danger"
          >
            {busy ? <Spinner /> : "Mark as churned"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
