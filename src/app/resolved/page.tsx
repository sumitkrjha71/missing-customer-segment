import { prisma } from "@/lib/db";
import { ResolvedExplorer } from "@/components/ResolvedExplorer";

export const dynamic = "force-dynamic";

export default async function ResolvedPage() {
  // Lightweight summary so the page header is informative even before scroll.
  const [total, bySegment, byStage] = await Promise.all([
    prisma.pendingRecord.count({ where: { status: "RESOLVED" } }),
    prisma.pendingRecord.groupBy({
      by: ["segment"],
      where: { status: "RESOLVED" },
      _count: { _all: true },
    }),
    prisma.pendingRecord.groupBy({
      by: ["stage"],
      where: { status: "RESOLVED" },
      orderBy: { stage: "asc" },
    }),
  ]);

  const counts = Object.fromEntries(
    bySegment.map((r) => [r.segment ?? "_churned", r._count._all]),
  ) as Record<string, number>;

  // Distinct (non-null) stages present among resolved records, for the filter.
  const stages = byStage.map((r) => r.stage).filter((s): s is string => !!s);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Resolved Accounts</h1>
          <p className="text-sm text-muted">
            One row per enterprise the portal has classified or churned.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted">
          <span className="pill bg-slate-100">Total {total}</span>
          {["ENT", "Mid", "SMB"].map((s) => (
            <span key={s} className="pill bg-slate-100">
              {s} {counts[s] ?? 0}
            </span>
          ))}
          <span className="pill bg-red-100 text-danger">
            Churned {counts["_churned"] ?? 0}
          </span>
        </div>
      </div>

      <ResolvedExplorer stages={stages} />
    </div>
  );
}
