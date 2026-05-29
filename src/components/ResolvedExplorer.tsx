"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { QueueRow, QueueResponse } from "@/lib/types";
import { DEFAULT_PAGE_SIZE, SEGMENTS } from "@/lib/constants";
import { ExportMenu } from "@/components/ExportMenu";
import { SegmentBadge, StatusPill, Spinner } from "@/components/ui";
import { ReassignDialog } from "@/components/ReassignDialog";

interface Filters {
  csm: string;
  q: string;
  segment: "ENT" | "Mid" | "SMB" | "";
  /** YYYY-MM-DD or "" — inclusive bounds on last_received_at. */
  lastReceivedFrom: string;
  lastReceivedTo: string;
}

/** Default sort: unique_qc_images DESC (nulls last), tiebroken by resolvedAt DESC. */
function sortByQcDesc(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const av = a.uniqueQcImages;
    const bv = b.uniqueQcImages;
    const at = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
    const bt = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
    if (av == null && bv == null) return bt - at;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return bt - at;
  });
}

/**
 * The Resolved tab. One row per enterprise classified/churned. Filter the view,
 * then export CSV/JSON/XLSX — the export reflects the active filter exactly,
 * so it doubles as the per-CSM handover artifact.
 */
export function ResolvedExplorer() {
  const [filters, setFilters] = useState<Filters>({
    csm: "",
    q: "",
    segment: "",
    lastReceivedFrom: "",
    lastReceivedTo: "",
  });
  const [qInput, setQInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
    }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const [rows, setRows] = useState<QueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const [reassigning, setReassigning] = useState<QueueRow | null>(null);

  const buildQuery = useCallback(
    (c?: string | null) => {
      const p = new URLSearchParams();
      p.set("status", "RESOLVED");
      p.set("take", String(DEFAULT_PAGE_SIZE));
      if (filters.csm) p.set("csm", filters.csm);
      if (filters.q) p.set("q", filters.q);
      if (filters.segment) p.set("segment", filters.segment);
      if (filters.lastReceivedFrom) p.set("lastReceivedFrom", filters.lastReceivedFrom);
      if (filters.lastReceivedTo) p.set("lastReceivedTo", filters.lastReceivedTo);
      if (c) p.set("cursor", c);
      return p.toString();
    },
    [filters],
  );

  const load = useCallback(
    async (c?: string | null) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const res = await fetch(`/api/queue?${buildQuery(c)}`, { cache: "no-store" });
        const data = (await res.json()) as QueueResponse;
        if (id !== reqId.current || !data.ok) return;
        setTotal(data.total);
        setCursor(data.nextCursor);
        setRows((prev) => (c ? [...prev, ...data.rows] : data.rows));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const display = useMemo(() => sortByQcDesc(rows), [rows]);

  const exportFilter = {
    status: "RESOLVED" as const,
    csm: filters.csm || undefined,
    q: filters.q || undefined,
    segment: filters.segment || undefined,
    lastReceivedFrom: filters.lastReceivedFrom || undefined,
    lastReceivedTo: filters.lastReceivedTo || undefined,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Each row is one enterprise the portal has resolved (assigned a segment
          or marked churned). The export below is the canonical handover artifact
          for the DB team — apply it as straight <code className="text-ink">UPDATE</code>s.
        </p>
        <ExportMenu filter={exportFilter} />
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted">Search</label>
          <input
            className="input mt-1 w-full"
            placeholder="Enterprise id/name, CSM…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted">CSM email</label>
          <input
            className="input mt-1 w-56"
            placeholder="filter by CSM email"
            value={filters.csm}
            onChange={(e) => setFilters((f) => ({ ...f, csm: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-xs text-muted">Segment</label>
          <select
            className="input mt-1 block w-32"
            value={filters.segment}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                segment: e.target.value as Filters["segment"],
              }))
            }
          >
            <option value="">Any</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Last image received — from</label>
          <input
            type="date"
            className="input mt-1 block w-40"
            value={filters.lastReceivedFrom}
            max={filters.lastReceivedTo || undefined}
            onChange={(e) =>
              setFilters((f) => ({ ...f, lastReceivedFrom: e.target.value }))
            }
          />
        </div>
        <div>
          <label className="text-xs text-muted">— to</label>
          <input
            type="date"
            className="input mt-1 block w-40"
            value={filters.lastReceivedTo}
            min={filters.lastReceivedFrom || undefined}
            onChange={(e) =>
              setFilters((f) => ({ ...f, lastReceivedTo: e.target.value }))
            }
          />
        </div>
        {(filters.lastReceivedFrom || filters.lastReceivedTo) && (
          <button
            type="button"
            className="text-xs text-muted hover:text-ink"
            onClick={() =>
              setFilters((f) => ({ ...f, lastReceivedFrom: "", lastReceivedTo: "" }))
            }
          >
            Clear dates
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted">
        {loading && <Spinner />}
        Showing {display.length} of {total} resolved record{total === 1 ? "" : "s"}.
      </div>

      {display.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-1 py-12 text-center">
          <div className="text-3xl">⌛</div>
          <div className="text-sm font-medium text-ink">
            No resolved records match.
          </div>
          <div className="text-xs text-muted">
            Resolved accounts show up here as soon as a CSM assigns or churns them.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Enterprise</th>
                <th className="px-4 py-2 font-medium">Segment</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">CSM</th>
                <th className="px-4 py-2 font-medium">Unique QC Images ↓</th>
                <th className="px-4 py-2 font-medium">Last Image Received at</th>
                <th className="px-4 py-2 font-medium">Resolved by</th>
                <th className="px-4 py-2 font-medium">Resolved at</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {display.map((r) => (
                <tr key={r.enterpriseId} className="hover:bg-surface">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/queue/${encodeURIComponent(r.enterpriseId)}`}
                      className="font-mono text-sm font-medium text-ink hover:underline"
                    >
                      {r.enterpriseId}
                    </Link>
                    <div className="text-xs text-slate-400">
                      {r.enterpriseName ?? "(unnamed)"}
                    </div>
                  </td>
                  <td className="px-4 py-2.5"><SegmentBadge segment={r.segment} /></td>
                  <td className="px-4 py-2.5"><StatusPill status={r.accountStatus} /></td>
                  <td className="px-4 py-2.5">
                    <div className="text-ink">{r.csmName ?? "—"}</div>
                    <div className="text-xs text-slate-400">{r.csmEmail ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {r.uniqueQcImages == null ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      <span className="text-sm font-medium text-ink">
                        {r.uniqueQcImages.toLocaleString()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted">
                    {r.lastImageReceivedAt
                      ? new Date(r.lastImageReceivedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.resolvedBy ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">
                    {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setReassigning(r)}
                      className="text-xs font-medium text-slate-500 hover:text-ink hover:underline whitespace-nowrap"
                    >
                      Reassign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div className="flex justify-center">
          <button className="btn-ghost" disabled={loading} onClick={() => load(cursor)}>
            {loading ? <Spinner /> : "Load more"}
          </button>
        </div>
      )}

      {reassigning && (
        <ReassignDialog
          record={reassigning}
          onClose={() => setReassigning(null)}
          onReassigned={(id, segment, newVersion) => {
            setRows((prev) =>
              prev.map((r) =>
                r.enterpriseId === id ? { ...r, segment, version: newVersion } : r,
              ),
            );
            setReassigning(null);
          }}
        />
      )}
    </div>
  );
}
