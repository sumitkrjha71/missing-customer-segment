import { getSummary } from "@/server/queries";
import { MetricCards } from "@/components/MetricCards";
import { QueueExplorer } from "@/components/QueueExplorer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const summary = await getSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Pending Queue</h1>
        <p className="text-sm text-muted">
          Classify enterprises into ENT / Mid / SMB, or mark churned. Resolved
          records leave the queue and become available to export.
        </p>
      </div>

      <MetricCards summary={summary} />

      <QueueExplorer csms={summary.perCsm} />
    </div>
  );
}
