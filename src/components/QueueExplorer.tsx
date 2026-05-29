"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QueueRow, QueueResponse } from "@/lib/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { AssignDialog } from "@/components/AssignDialog";
import { ExportMenu, type ExportFilter } from "@/components/ExportMenu";
import { SegmentBadge, StatusPill, Spinner } from "@/components/ui";

interface StageOption {
  stage: string | null;
  count: number;
}

interface Filters {
  status: "PENDING" | "RESOLVED";
  stage: string;
  q: string;
  /** YYYY-MM-DD strings (native <input type="date"> output) or "" for "no bound". */
  lastReceivedFrom: string;
  lastReceivedTo: string;
}

/** Group key for a (possibly null) stage. Null stage collapses to "__none__". */
const stageKey = (stage: string | null) => stage ?? "__none__";
const stageLabel = (stage: string | null) => stage ?? "No stage";

/**
 * The home dashboard's queue surface.
 *
 * Grouped view (default for Pending): renders ONE collapsible bar per STAGE from
 * the authoritative summary list (`summary.perStage`), regardless of which pages
 * have been loaded. Each bar lazy-fetches its stage's rows on expand so we don't
 * pull the whole queue up front.
 *
 * Flat view: kicks in when the user picks a specific stage from the filter, when
 * grouping is turned off, or when looking at the Resolved state.
 *
 * Default sort everywhere is `unique_qc_images DESC` (nulls last), tiebroken
 * by enterprise_id for stability.
 */
export function QueueExplorer({ stages }: { stages: StageOption[] }) {
  const [filters, setFilters] = useState<Filters>({
    status: "PENDING",
    stage: "",
    q: "",
    lastReceivedFrom: "",
    lastReceivedTo: "",
  });
  const [qInput, setQInput] = useState("");
  const [groupByStage, setGroupByStage] = useState(true);

  // Per-stage pending counts, seeded from the server summary and decremented
  // locally as records resolve (keeps the badges in sync without a refetch).
  const [stageCounts, setStageCounts] = useState<Record<string, { count: number }>>(() => {
    const m: Record<string, { count: number }> = {};
    for (const s of stages) {
      m[stageKey(s.stage)] = { count: s.count };
    }
    return m;
  });

  // Records resolved in this session — child groups filter these out of their
  // own row lists, so resolved rows disappear without a refetch.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const [selected, setSelected] = useState<QueueRow | null>(null);

  // Debounce free-text search into the active filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
    }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const showGroups =
    groupByStage && !filters.stage && filters.status === "PENDING";

  function handleResolved(enterpriseId: string, stage: string | null) {
    setResolvedIds((prev) => {
      const next = new Set(prev);
      next.add(enterpriseId);
      return next;
    });
    const key = stageKey(stage);
    setStageCounts((prev) => {
      const cur = prev[key];
      if (!cur) return prev;
      return {
        ...prev,
        [key]: { ...cur, count: Math.max(0, cur.count - 1) },
      };
    });
  }

  const exportFilter: ExportFilter = {
    status: filters.status,
    stage: filters.stage || undefined,
    q: filters.q || undefined,
    lastReceivedFrom: filters.lastReceivedFrom || undefined,
    lastReceivedTo: filters.lastReceivedTo || undefined,
  };

  const groupEntries = useMemo(
    () =>
      Object.entries(stageCounts)
        .filter(([, v]) => v.count > 0)
        .sort(([, a], [, b]) => b.count - a.count),
    [stageCounts],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar — no central CTA; assignment starts by clicking a row. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={groupByStage}
            onChange={(e) => setGroupByStage(e.target.checked)}
          />
          Group by stage
        </label>
        <ExportMenu filter={exportFilter} />
      </div>

      {/* Filter bar */}
      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted">Search</label>
          <input
            className="input mt-1 w-full"
            placeholder="Enterprise, CSM name or email…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted">Stage</label>
          <select
            className="input mt-1 block w-48"
            value={filters.stage}
            onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))}
          >
            <option value="">All stages</option>
            <option value="__none__">— No stage —</option>
            {stages
              .filter((s) => s.stage)
              .map((s) => (
                <option key={s.stage} value={s.stage!}>
                  {s.stage} ({s.count})
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
        <div>
          <label className="text-xs text-muted">State</label>
          <select
            className="input mt-1 block w-32"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as Filters["status"],
              }))
            }
          >
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
          </select>
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

      {/* Body */}
      {showGroups ? (
        groupEntries.length === 0 ? (
          <EmptyState status="PENDING" />
        ) : (
          <div className="space-y-3">
            {groupEntries.map(([key, val], i) => (
              <StageGroupLazy
                key={key}
                stage={key === "__none__" ? null : key}
                count={val.count}
                filters={filters}
                resolvedIds={resolvedIds}
                defaultOpen={i === 0}
                onOpenRecord={setSelected}
              />
            ))}
          </div>
        )
      ) : (
        <FlatQueue
          filters={filters}
          resolvedIds={resolvedIds}
          onOpenRecord={setSelected}
        />
      )}

      {/* Assignment dialog */}
      {selected && (
        <AssignDialog
          record={selected}
          onClose={() => setSelected(null)}
          onResolved={(id) => handleResolved(id, selected.stage)}
          onStale={() => {
            setResolvedIds((prev) => new Set(prev));
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Sort ─────────────────────────── */

/**
 * Default sort everywhere: unique_qc_images DESC with NULLS LAST,
 * tiebroken by enterpriseId ASC for stable ordering.
 */
function sortByQcDesc(rows: QueueRow[]): QueueRow[] {
  return [...rows].sort((a, b) => {
    const av = a.uniqueQcImages;
    const bv = b.uniqueQcImages;
    if (av == null && bv == null) return a.enterpriseId.localeCompare(b.enterpriseId);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (bv !== av) return bv - av;
    return a.enterpriseId.localeCompare(b.enterpriseId);
  });
}

/* ─────────────────────────── Per-stage collapsible ──────────────────────────── */

interface StageGroupLazyProps {
  stage: string | null;
  count: number;
  filters: Filters;
  resolvedIds: Set<string>;
  defaultOpen?: boolean;
  onOpenRecord: (r: QueueRow) => void;
}

function StageGroupLazy({
  stage,
  count,
  filters,
  resolvedIds,
  defaultOpen,
  onOpenRecord,
}: StageGroupLazyProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const reqId = useRef(0);

  const fetchRows = useCallback(
    async (cursorParam?: string | null) => {
      const id = ++reqId.current;
      setLoading(true);
      try {
        const p = new URLSearchParams();
        p.set("status", "PENDING");
        p.set("stage", stageKey(stage));
        if (filters.q) p.set("q", filters.q);
        // Within ONE stage group, sort is client-side by unique_qc_images DESC.
        // Pulling a generous page (capped at the server max of 200) makes that
        // sort represent the whole stage at typical scale, instead of the first
        // 50 rows by enterprise_id.
        p.set("take", "200");
        if (cursorParam) p.set("cursor", cursorParam);

        const res = await fetch(`/api/queue?${p.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as QueueResponse;
        if (id !== reqId.current) return;
        if (!data.ok) return;
        setRows((prev) => (cursorParam ? [...prev, ...data.rows] : data.rows));
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        setLoaded(true);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [stage, filters.q],
  );

  useEffect(() => {
    if (open) {
      fetchRows(null);
    } else {
      setRows([]);
      setCursor(null);
      setHasMore(false);
      setLoaded(false);
    }
  }, [open, fetchRows]);

  const visibleRows = useMemo(
    () => sortByQcDesc(rows.filter((r) => !resolvedIds.has(r.enterpriseId))),
    [rows, resolvedIds],
  );

  const displayName = stageLabel(stage);
  const isFiltered = !!filters.q;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-muted">{open ? "▾" : "▸"}</span>
          <span className="truncate text-sm font-medium text-ink">{displayName}</span>
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {isFiltered && open && (
            <span className="text-[11px] text-muted">{visibleRows.length} matching</span>
          )}
          <span className="pill bg-slate-100 text-slate-600" title="Total pending for this stage">
            {Math.max(0, count - rows.filter((r) => resolvedIds.has(r.enterpriseId)).length)}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line">
          {loading && !loaded ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
              <Spinner /> Loading…
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted">
              {isFiltered ? "No records match the current filter." : "No pending records."}
            </div>
          ) : (
            <>
              <QueueTable rows={visibleRows} onOpen={onOpenRecord} embedded />
              {hasMore && (
                <div className="border-t border-line bg-surface px-4 py-2 text-center">
                  <button
                    className="btn-ghost text-xs"
                    disabled={loading}
                    onClick={() => fetchRows(cursor)}
                  >
                    {loading ? <Spinner /> : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Flat view ─────────────────────────────── */

function FlatQueue({
  filters,
  resolvedIds,
  onOpenRecord,
}: {
  filters: Filters;
  resolvedIds: Set<string>;
  onOpenRecord: (r: QueueRow) => void;
}) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const buildQuery = useCallback(
    (c?: string | null) => {
      const p = new URLSearchParams();
      p.set("status", filters.status);
      p.set("take", String(DEFAULT_PAGE_SIZE));
      if (filters.stage) p.set("stage", filters.stage);
      if (filters.q) p.set("q", filters.q);
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

  const display = useMemo(
    () => sortByQcDesc(rows.filter((r) => !resolvedIds.has(r.enterpriseId))),
    [rows, resolvedIds],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        {loading && <Spinner />}
        Showing {display.length} of {total} {filters.status.toLowerCase()} record
        {total === 1 ? "" : "s"}.
      </div>
      {display.length === 0 && !loading ? (
        <EmptyState status={filters.status} />
      ) : (
        <QueueTable rows={display} onOpen={onOpenRecord} />
      )}
      {cursor && (
        <div className="flex justify-center">
          <button className="btn-ghost" disabled={loading} onClick={() => load(cursor)}>
            {loading ? <Spinner /> : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Table ─────────────────────────────── */

function QueueTable({
  rows,
  onOpen,
  embedded,
}: {
  rows: QueueRow[];
  onOpen: (r: QueueRow) => void;
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? "" : "overflow-hidden rounded-xl border border-line bg-white"}>
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Enterprise</th>
            <th className="px-4 py-2 font-medium">Segment</th>
            <th className="px-4 py-2 font-medium">Account</th>
            <th className="px-4 py-2 font-medium">Stage</th>
            <th className="px-4 py-2 font-medium">CSM</th>
            <th
              className="px-4 py-2 font-medium"
              title="Default sort: highest unique_qc_images first"
            >
              Unique QC Images ↓
            </th>
            <th className="px-4 py-2 font-medium">Last Image Received at</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr
              key={r.enterpriseId}
              className="cursor-pointer hover:bg-surface"
              onClick={() => onOpen(r)}
            >
              <td className="px-4 py-2.5">
                {/* enterprise_id is the operational key — promote it to primary. */}
                <div className="font-mono text-sm font-medium text-ink">
                  {r.enterpriseId}
                </div>
                <div className="text-xs text-slate-400">
                  {r.enterpriseName ?? "(unnamed)"}
                </div>
              </td>
              <td className="px-4 py-2.5"><SegmentBadge segment={r.segment} /></td>
              <td className="px-4 py-2.5"><StatusPill status={r.accountStatus} /></td>
              <td className="px-4 py-2.5 text-ink">{r.stage ?? "—"}</td>
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
              <td className="px-4 py-2.5 text-right">
                <span className="btn-ghost py-1 text-xs">Assign →</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ status }: { status: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 py-12 text-center">
      <div className="text-3xl">🎉</div>
      <div className="text-sm font-medium text-ink">
        {status === "PENDING" ? "No pending records match." : "No resolved records yet."}
      </div>
      <div className="text-xs text-muted">
        {status === "PENDING"
          ? "The queue is clear for this filter."
          : "Resolved records will appear here after assignment."}
      </div>
    </div>
  );
}
