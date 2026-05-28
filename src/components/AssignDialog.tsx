"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { assignSegment, assignCsm } from "@/app/actions";
import { SEGMENTS, type Segment } from "@/lib/constants";
import { CSM_EMAILS, isKnownCsmEmail } from "@/lib/csm-emails";
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
  // `email` is the typed/selected value. When it exactly matches a known CSM
  // email, the Assign button enables. The combobox below filters the dropdown
  // live as the user types.
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    [record.enterpriseId],
  );

  const canSubmit = !busy && isKnownCsmEmail(email);

  async function submit() {
    if (!canSubmit) return;
    const chosen = email.trim().toLowerCase();
    setBusy(true);
    try {
      const res = await assignCsm({
        enterpriseId: record.enterpriseId,
        csmEmail: chosen,
        expectedVersion: record.version,
        idempotencyKey,
      });
      if (res.ok) {
        toast.push(
          "success",
          res.replay
            ? `CSM was already set to ${chosen}.`
            : `CSM assigned: ${chosen}.`,
        );
        onAssigned(chosen, res.record.version);
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
    <div className="flex flex-wrap items-start gap-1.5">
      <div className="min-w-0 flex-1">
        <CsmEmailCombobox
          value={email}
          onChange={setEmail}
          onCommit={submit}
          disabled={busy}
        />
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="btn-primary px-2.5 py-1 text-xs"
      >
        {busy ? <Spinner /> : "Assign"}
      </button>
    </div>
  );
}

/* ────────────────────────── CSM email combobox ────────────────────────── */

interface CsmEmailComboboxProps {
  value: string;
  onChange: (next: string) => void;
  /** Triggered by Enter after a definitive selection (or on a known exact value). */
  onCommit?: () => void;
  disabled?: boolean;
}

/**
 * Searchable type-ahead combobox over the fixed CSM email roster.
 *
 *   • Filters live on each keystroke (substring, case-insensitive).
 *   • ↑/↓ move highlight, Enter selects (or commits if already a known email),
 *     Esc closes the dropdown, mouse click works too.
 *   • Click-outside closes the dropdown.
 *   • The input value IS the displayed/typed text; whether it's a "real" CSM is
 *     decided by `isKnownCsmEmail`, which the parent uses to enable Assign.
 */
function CsmEmailCombobox({
  value,
  onChange,
  onCommit,
  disabled,
}: CsmEmailComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return CSM_EMAILS as readonly string[];
    return CSM_EMAILS.filter((e) => e.includes(q));
  }, [value]);

  // Whenever the filtered set shrinks/grows, snap the highlight back into range
  // so it never points at a missing index.
  useEffect(() => {
    if (highlight >= filtered.length) {
      setHighlight(filtered.length === 0 ? 0 : filtered.length - 1);
    }
  }, [filtered.length, highlight]);

  // Close on outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(email: string) {
    onChange(email);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        const picked = filtered[highlight];
        pick(picked);
        // Commit on the next tick so the parent's `canSubmit` reflects the new value.
        if (onCommit) setTimeout(() => onCommit(), 0);
      } else if (isKnownCsmEmail(value)) {
        e.preventDefault();
        onCommit?.();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const validMark = isKnownCsmEmail(value);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        className={
          "input w-full py-1 pr-7 text-xs " +
          (value && !validMark ? "border-amber-300" : "")
        }
        placeholder="Type to search CSM email…"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value.toLowerCase());
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="csm-email-listbox"
      />
      {validMark && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ok"
          title="Known CSM"
        >
          ✓
        </span>
      )}
      {open && (
        <ul
          id="csm-email-listbox"
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No CSM matches.</li>
          ) : (
            filtered.map((email, i) => (
              <li
                key={email}
                role="option"
                aria-selected={i === highlight}
                className={
                  "cursor-pointer px-3 py-1.5 text-xs " +
                  (i === highlight
                    ? "bg-surface font-medium text-ink"
                    : "text-ink hover:bg-surface")
                }
                onMouseDown={(e) => {
                  // Prevent input blur before we update state.
                  e.preventDefault();
                  pick(email);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {email}
              </li>
            ))
          )}
        </ul>
      )}
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
