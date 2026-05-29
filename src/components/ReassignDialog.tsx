"use client";

import { useEffect, useMemo, useState } from "react";
import { reassignSegment } from "@/app/actions";
import { SEGMENTS, type Segment } from "@/lib/constants";
import type { QueueRow } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { SegmentBadge, Spinner } from "@/components/ui";
import { Overlay } from "@/components/AssignDialog";

const SEGMENT_HINTS: Record<Segment, string> = {
  ENT: "Enterprise — largest accounts",
  Mid: "Mid-market",
  SMB: "Small & medium business",
};

interface Props {
  record: QueueRow;
  onClose: () => void;
  /** Called on success with the updated row fields so the list can update in-place. */
  onReassigned: (enterpriseId: string, segment: string, newVersion: number) => void;
}

export function ReassignDialog({ record, onClose, onReassigned }: Props) {
  const toast = useToast();
  const [selected, setSelected] = useState<Segment | null>(null);
  const [busy, setBusy] = useState(false);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), [record.enterpriseId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleReassign() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const res = await reassignSegment({
        enterpriseId: record.enterpriseId,
        segment: selected,
        expectedVersion: record.version,
        idempotencyKey,
      });
      if (res.ok) {
        toast.push(
          "success",
          res.replay
            ? `${record.enterpriseId} was already reassigned to ${selected}.`
            : `Reassigned ${record.enterpriseId} to ${selected}.`,
        );
        onReassigned(record.enterpriseId, selected, res.record.version);
        onClose();
      } else if (res.reason === "STALE") {
        const by = res.current?.resolvedBy;
        toast.push(
          "info",
          `This record was just updated${by ? ` by ${by}` : ""}. Please refresh.`,
        );
        onClose();
      } else if (res.reason === "AUTH") {
        toast.push("error", "Your session expired. Please sign in again.");
      } else {
        toast.push("error", "Couldn't reassign. Please try again.");
      }
    } catch {
      toast.push("error", "Network error. Your change was not applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={() => !busy && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Reassign Customer Segment</h2>
            <p className="mt-0.5 text-sm text-muted">
              <span className="font-mono text-ink">{record.enterpriseId}</span>{" "}
              <span className="text-xs text-slate-400">· {record.enterpriseName ?? "(unnamed)"}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">×</button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted">Current segment:</span>
          <SegmentBadge segment={record.segment} />
        </div>

        <p className="mt-4 text-xs text-muted">Step 1 — select the correct segment:</p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {SEGMENTS.map((s) => (
            <button
              key={s}
              onClick={() => setSelected(s)}
              disabled={busy}
              className={
                "flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center transition disabled:opacity-50 " +
                (selected === s
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white hover:border-slate-400 hover:bg-surface")
              }
            >
              <span className="text-lg font-semibold">{s}</span>
              <span className={`text-[11px] leading-tight ${selected === s ? "text-white/70" : "text-muted"}`}>
                {SEGMENT_HINTS[s]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          <button
            onClick={handleReassign}
            disabled={!selected || busy}
            className="btn-primary w-full py-2.5"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Reassigning…</span>
            ) : selected ? (
              `Confirm — Reassign as ${selected}`
            ) : (
              "Select a segment above"
            )}
          </button>
        </div>

        <div className="mt-4 flex justify-end border-t border-line pt-4">
          <button onClick={onClose} disabled={busy} className="btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}
