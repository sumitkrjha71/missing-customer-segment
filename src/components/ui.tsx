export function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) {
    return <span className="pill bg-slate-100 text-slate-500">—</span>;
  }
  const tone =
    segment === "ENT"
      ? "bg-indigo-100 text-indigo-700"
      : segment === "Mid"
        ? "bg-sky-100 text-sky-700"
        : "bg-teal-100 text-teal-700";
  return <span className={`pill ${tone}`}>{segment}</span>;
}

export function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "—").toLowerCase();
  const tone =
    s === "churned"
      ? "bg-red-100 text-danger"
      : s === "unassigned"
        ? "bg-amber-100 text-warn"
        : s === "resolved"
          ? "bg-green-100 text-ok"
          : "bg-slate-100 text-slate-600";
  return <span className={`pill ${tone}`}>{status ?? "—"}</span>;
}

export function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
      aria-label="Loading"
    />
  );
}
