"use client";

import { useState } from "react";

export interface ExportFilter {
  status: "PENDING" | "RESOLVED";
  stage?: string;
  q?: string;
  segment?: string;
  /** YYYY-MM-DD inclusive lower bound on last_received_at. */
  lastReceivedFrom?: string;
  /** YYYY-MM-DD inclusive upper bound on last_received_at. */
  lastReceivedTo?: string;
}

function toQuery(filter: ExportFilter): string {
  const p = new URLSearchParams();
  p.set("status", filter.status);
  if (filter.stage) p.set("stage", filter.stage);
  if (filter.q) p.set("q", filter.q);
  if (filter.segment) p.set("segment", filter.segment);
  if (filter.lastReceivedFrom) p.set("lastReceivedFrom", filter.lastReceivedFrom);
  if (filter.lastReceivedTo) p.set("lastReceivedTo", filter.lastReceivedTo);
  return p.toString();
}

/**
 * Export the CURRENT filtered view in CSV / JSON / XLSX. Because the export
 * routes accept the same filter params as the queue, the file always matches
 * exactly what the user is looking at (whole queue, filtered, or per-stage).
 */
export function ExportMenu({ filter }: { filter: ExportFilter }) {
  const [open, setOpen] = useState(false);
  const qs = toQuery(filter);

  const formats: { ext: string; label: string }[] = [
    { ext: "csv", label: "CSV (.csv)" },
    { ext: "xlsx", label: "Excel (.xlsx)" },
    { ext: "json", label: "JSON (.json)" },
  ];

  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
        Export ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
            <div className="border-b border-line px-3 py-2 text-[11px] uppercase tracking-wide text-slate-400">
              Export {filter.stage ? "this stage" : filter.status.toLowerCase()}
            </div>
            {formats.map((f) => (
              <a
                key={f.ext}
                href={`/api/export/${f.ext}?${qs}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-sm text-ink hover:bg-surface"
              >
                {f.label}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
