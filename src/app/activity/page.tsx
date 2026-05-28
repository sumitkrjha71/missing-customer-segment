import { prisma } from "@/lib/db";
import { AuditFeed } from "@/components/AuditFeed";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const [total, byAction] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({
      by: ["action"],
      _count: { _all: true },
    }),
  ]);

  const counts = Object.fromEntries(
    byAction.map((r) => [r.action, r._count._all]),
  ) as Record<string, number>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Activity Log</h1>
          <p className="text-sm text-muted">
            Append-only record of every assignment or churn made on this portal.
          </p>
        </div>
        <div className="flex gap-2 text-xs text-muted">
          <span className="pill bg-slate-100">Total {total}</span>
          <span className="pill bg-slate-100">Assigns {counts["ASSIGN"] ?? 0}</span>
          <span className="pill bg-red-100 text-danger">
            Churns {counts["CHURN"] ?? 0}
          </span>
        </div>
      </div>

      <AuditFeed />
    </div>
  );
}
