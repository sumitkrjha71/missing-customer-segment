import type { DashboardSummary } from "@/server/queries";

function timeAgo(d: Date | null): string {
  if (!d) return "never";
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function MetricCards({ summary }: { summary: DashboardSummary }) {
  const cards = [
    { label: "Pending accounts", value: summary.totalPending, hint: "awaiting a segment decision" },
    { label: "NULL segment", value: summary.nullSegment, hint: "no segment in source" },
    { label: "Unassigned", value: summary.unassigned, hint: "marked 'unassigned'" },
    { label: "Stages with backlog", value: summary.stageCount, hint: "have ≥1 pending" },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-2xl font-semibold text-ink">{c.value}</div>
            <div className="mt-1 text-xs font-medium text-ink">{c.label}</div>
            <div className="text-[11px] text-muted">{c.hint}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            summary.lastSync?.status === "FAILED" ? "bg-danger" : "bg-ok"
          }`}
        />
        Last sync: {timeAgo(summary.lastSync?.finishedAt ?? null)}
        {summary.lastSync ? ` · ${summary.lastSync.status} · ${summary.lastSync.rowsUpserted} rows` : ""}
      </div>
    </div>
  );
}
