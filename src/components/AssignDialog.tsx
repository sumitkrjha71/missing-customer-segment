"use client";

import { useEffect, useMemo, useState } from "react";
import { assignSegment, assignCsm } from "@/app/actions";
import { SEGMENTS, type Segment } from "@/lib/constants";
import type { QueueRow } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { SegmentBadge, StatusPill, Spinner } from "@/components/ui";
import { ChurnConfirmDialog } from "@/components/ChurnConfirmDialog";

interface Props {
  record: QueueRow;
  onClose: () => void;
  /** Called when the record was resolved (assigned or churned) — remove from list. */
  onResolved: (enterpriseId: string) => void;
  /** Called when a stale conflict tells us the live version differs. */
  onStale?: () => void;
}

const SEGMENT_HINTS: Record<Segment, string> = {
  ENT: "Enterprise — largest accounts",
  Mid: "Mid-market",
  SMB: "Small & medium business",
};

export function AssignDialog({ record, onClose, onResolved, onStale }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<Segment | null>(null);
  const [showChurn, setShowChurn] = useState(false);

  // Local mirror of the record. Mutations made INSIDE this dialog (e.g.
  // assigning a CSM via the inline action) update `current` so subsequent
  // segment buttons CAS on the new version, and the UI reflects the new state.
  const [current, setCurrent] = useState<QueueRow>(record);
  useEffect(() => setCurrent(record), [record.enterpriseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // One idempotency key per OPEN of the dialog (per intent for the SEGMENT
  // decision). The inline Assign-CSM action has its own key.
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    [record.enterpriseId],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !showChurn) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, showChurn, onClose]);

  const accountIsChurned =
    (current.accountStatus ?? "").toLowerCase() === "churned";
  const canAssignCsm = !current.csmEmail && !accountIsChurned;

  async function handleAssign(segment: Segment) {
    setBusy(segment);
    try {
      const res = await assignSegment({
        enterpriseId: current.enterpriseId,
        segment,
        expectedVersion: current.version,
        idempotencyKey,
      });
      if (res.ok) {
        toast.push(
          "success",
          res.replay
            ? `${current.enterpriseId} was already assigned ${segment}.`
            : `Assigned ${segment} to ${current.enterpriseId}.`,
        );
        onResolved(current.enterpriseId);
        onClose();
      } else if (res.reason === "STALE") {
        const by = res.current?.resolvedBy;
        toast.push(
          "info",
          `This record was just updated${by ? ` by ${by}` : ""}. Refreshing the queue.`,
        );
        onStale?.();
        onClose();
      } else if (res.reason === "AUTH") {
        toast.push("error", "Your session expired. Please sign in again.");
      } else {
        toast.push("error", "Couldn’t assign. Please try again.");
      }
    } catch {
      toast.push("error", "Network error. Your change was not applied.");
    } finally {
      setBusy(null);
    }
  }

  if (showChurn) {
    return (
      <ChurnConfirmDialog
        record={current}
        onCancel={() => setShowChurn(false)}
        onChurned={(id) => {
          onResolved(id);
          onClose();
        }}
        onStale={() => {
          onStale?.();
          onClose();
        }}
      />
    );
  }

  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">
              Assign Customer Segment
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-mono text-ink">{current.enterpriseId}</span>{" "}
              <span className="text-xs text-slate-400">
                · {current.enterpriseName ?? "(unnamed)"}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {/* Operational #1: Current segment — set via the ENT/Mid/SMB buttons below. */}
          <Field label="Current segment"><SegmentBadge segment={current.segment} /></Field>
          <Field label="Account status"><StatusPill status={current.accountStatus} /></Field>
          <Field label="CSM">{current.csmName ?? "—"}</Field>
          {/* Operational #2: CSM email — inline-assignable when missing on a live account. */}
          <Field label="CSM email">
            {current.csmEmail ? (
              <span>{current.csmEmail}</span>
            ) : canAssignCsm ? (
              <AssignCsmInline
                record={current}
                onAssigned={(email, newVersion) =>
                  setCurrent((c) => ({ ...c, csmEmail: email, version: newVersion }))
                }
                onStale={() => {
                  onStale?.();
                  onClose();
                }}
              />
            ) : (
              <span className="text-muted">—</span>
            )}
          </Field>
        </dl>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => handleAssign(s)}
              disabled={busy !== null}
              className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white px-3 py-4 text-center transition hover:border-slate-400 hover:bg-surface disabled:opacity-50"
            >
              <span className="text-lg font-semibold text-ink">
                {busy === s ? <Spinner /> : s}
              </span>
              <span className="text-[11px] leading-tight text-muted">
                {SEGMENT_HINTS[s]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <button
            onClick={() => setShowChurn(true)}
            disabled={busy !== null}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-50"
          >
            Mark as churned…
          </button>
          <button onClick={onClose} disabled={busy !== null} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}

/* ──────────────────────────── Inline Assign-CSM ──────────────────────────── */

interface AssignCsmInlineProps {
  record: QueueRow;
  /** Called on success with the canonical lowercased email + new record version. */
  onAssigned: (email: string, newVersion: number) => void;
  onStale?: () => void;
}

function AssignCsmInline({ record, onAssigned, onStale }: AssignCsmInlineProps) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    [record.enterpriseId],
  );

  async function submit() {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.push("error", "Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await assignCsm({
        enterpriseId: record.enterpriseId,
        csmEmail: trimmed,
        expectedVersion: record.version,
        idempotencyKey,
      });
      if (res.ok) {
        toast.push(
          "success",
          res.replay
            ? `CSM was already set to ${trimmed}.`
            : `CSM assigned: ${trimmed}.`,
        );
        onAssigned(trimmed, res.record.version);
      } else if (res.reason === "STALE") {
        toast.push("info", "This record was just updated. Refreshing.");
        onStale?.();
      } else if (res.reason === "AUTH") {
        toast.push("error", "Your session expired. Please sign in again.");
      } else if (res.reason === "VALIDATION") {
        toast.push("error", "Invalid email format.");
      } else {
        toast.push("error", res.message ?? "Couldn’t assign CSM.");
      }
    } catch {
      toast.push("error", "Network error. Your change was not applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !busy && submit()}
        placeholder="csm@spyne.ai"
        className="input min-w-0 flex-1 py-1 text-xs"
        disabled={busy}
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn-primary px-2.5 py-1 text-xs"
      >
        {busy ? <Spinner /> : "Assign"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}

export function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
