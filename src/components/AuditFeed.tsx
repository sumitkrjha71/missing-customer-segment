"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/ui";

interface AuditRow {
  id: string;
  enterpriseId: string;
  enterpriseName: string | null;
  action: "ASSIGN" | "CHURN" | "ASSIGN_CSM";
  fromSegment: string | null;
  toSegment: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  fromCsmEmail: string | null;
  toCsmEmail: string | null;
  actorEmail: string;
  createdAt: string;
}

interface AuditResponse {
  ok: boolean;
  total: number;
  nextCursor: string | null;
  rows: AuditRow[];
}

interface Filters {
  action: "" | "ASSIGN" | "CHURN" | "ASSIGN_CSM";
  actor: string;
  q: string;
}

/**
 * Activity Log — chronological feed of every change made on the portal.
 * Filter, then download the filtered slice as CSV / JSON / XLSX from the menu.
 */
export function AuditFeed() {
  const [filters, setFilters] = useState<Filters>({ action: "", actor: "", q: "" });
  const [qInput, setQInput] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
    }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const reqId = useRef(0);

  const buildQuery = useCallback(
    (c?: string | null) => {
      const p = new URLSearchParams();
      p.set("take", "50");
      if (filters.action) p.set("action", filters.action);
      if (filters.actor) p.set("actor", filters.actor);
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
        const res = await fetch(`/api/audit?${buildQuery(c)}`, { cache: "no-store" });
        const data = (await res.json()) as AuditResponse;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Every assignment and churn made on the portal, newest first. Use the
          filters to slice, then export — the file matches exactly what's on screen.
        </p>
        <div className="relative">
          <button className="btn-ghost" onClick={() => setShowExport((s) => !s)}>
            Export activity ▾
          </button>
          {showExport && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                {[
                  { ext: "csv", label: "CSV (.csv)" },
                  { ext: "xlsx", label: "Excel (.xlsx)" },
                  { ext: "json", label: "JSON (.json)" },
                ].map((f) => (
                  <a
                    key={f.ext}
                    href={`/api/export/audit/${f.ext}?${buildQuery()}`}
                    onClick={() => setShowExport(false)}
                    className="block px-3 py-2 text-sm text-ink hover:bg-surface"
                  >
                    {f.label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted">Search</label>
          <input
            className="input mt-1 w-full"
            placeholder="enterprise id or actor email…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted">Action</label>
          <select
            className="input mt-1 block w-36"
            value={filters.action}
            onChange={(e) =>
              setFilters((f) => ({ ...f, action: e.target.value as Filters["action"] }))
            }
          >
            <option value="">Any</option>
            <option value="ASSIGN">Assign segment</option>
            <option value="ASSIGN_CSM">Assign CSM</option>
            <option value="CHURN">Churn</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">Actor</label>
          <input
            className="input mt-1 w-56"
            placeholder="actor email (substring)"
            value={filters.actor}
            onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted">
        {loading && <Spinner />}
        Showing {rows.length} of {total} event{total === 1 ? "" : "s"}.
      </div>

      {rows.length === 0 && !loading ? (
        <div className="card flex flex-col items-center gap-1 py-12 text-center">
          <div className="text-3xl">📝</div>
          <div className="text-sm font-medium text-ink">No activity yet.</div>
          <div className="text-xs text-muted">
            Once CSMs start assigning or churning records, the events appear here.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Enterprise</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Change</th>
                <th className="px-4 py-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
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
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        "pill " +
                        (r.action === "CHURN"
                          ? "bg-red-100 text-danger"
                          : r.action === "ASSIGN_CSM"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-slate-100 text-slate-600")
                      }
                    >
                      {r.action === "ASSIGN_CSM" ? "ASSIGN CSM" : r.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink">
                    {r.action === "ASSIGN" ? (
                      <span>
                        segment{" "}
                        <span className="text-slate-400">
                          {r.fromSegment ?? "—"} →
                        </span>{" "}
                        <span className="font-medium">{r.toSegment ?? "—"}</span>
                      </span>
                    ) : r.action === "ASSIGN_CSM" ? (
                      <span>
                        csm{" "}
                        <span className="text-slate-400">
                          {r.fromCsmEmail ?? "—"} →
                        </span>{" "}
                        <span className="font-medium">{r.toCsmEmail ?? "—"}</span>
                      </span>
                    ) : (
                      <span>
                        status →{" "}
                        <span className="font-medium text-danger">
                          {r.toStatus ?? "churned"}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.actorEmail}</td>
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
    </div>
  );
}
