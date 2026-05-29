import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecord, getAuditForEnterprise } from "@/server/queries";
import { RecordActions } from "@/components/RecordActions";
import { SegmentBadge, StatusPill } from "@/components/ui";
import type { QueueRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({
  params,
}: {
  params: { enterpriseId: string };
}) {
  const enterpriseId = decodeURIComponent(params.enterpriseId);
  const record = await getRecord(enterpriseId);
  if (!record) notFound();

  const audit = await getAuditForEnterprise(enterpriseId);

  const row: QueueRow = {
    enterpriseId: record.enterpriseId,
    enterpriseName: record.enterpriseName,
    csmName: record.csmName,
    csmEmail: record.csmEmail,
    accountStatus: record.accountStatus,
    stage: record.stage,
    segment: record.segment,
    status: record.status,
    version: record.version,
    uniqueQcImages: record.uniqueQcImages,
    lastImageReceivedAt: record.lastImageReceivedAt?.toISOString() ?? null,
    firstSeenAt: record.firstSeenAt.toISOString(),
    sourceUpdatedAt: record.sourceUpdatedAt?.toISOString() ?? null,
    resolvedBy: record.resolvedBy,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← Back to queue
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl font-semibold text-ink">
            {record.enterpriseId}
          </h1>
          <p className="text-sm text-slate-400">
            {record.enterpriseName ?? "(unnamed enterprise)"}
          </p>
        </div>
        <RecordActions record={row} />
      </div>

      <div className="card grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3">
        <Field label="Segment"><SegmentBadge segment={record.segment} /></Field>
        <Field label="Account status"><StatusPill status={record.accountStatus} /></Field>
        <Field label="Queue state"><StatusPill status={record.status} /></Field>
        <Field label="Stage">{record.stage ?? "—"}</Field>
        <Field label="CSM">{record.csmName ?? "—"}</Field>
        <Field label="CSM email">{record.csmEmail ?? "—"}</Field>
        <Field label="Unique QC Images">
          {record.uniqueQcImages == null ? "—" : record.uniqueQcImages.toLocaleString()}
        </Field>
        <Field label="Last Image Received at">
          {record.lastImageReceivedAt?.toLocaleString() ?? "—"}
        </Field>
        <Field label="First seen">{record.firstSeenAt.toLocaleString()}</Field>
        <Field label="Source updated">
          {record.sourceUpdatedAt?.toLocaleString() ?? "—"}
        </Field>
        <Field label="Resolved by">{record.resolvedBy ?? "—"}</Field>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink">Audit history</h2>
        {audit.length === 0 ? (
          <div className="card text-sm text-muted">No changes recorded yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Change</th>
                  <th className="px-4 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-muted">
                      {a.createdAt.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          "pill " +
                          (a.action === "CHURN"
                            ? "bg-red-100 text-danger"
                            : a.action === "ASSIGN_CSM"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-slate-100 text-slate-600")
                        }
                      >
                        {a.action === "ASSIGN_CSM" ? "ASSIGN CSM" : a.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink">
                      {a.action === "ASSIGN"
                        ? `→ ${a.toSegment}`
                        : a.action === "ASSIGN_CSM"
                          ? `csm → ${a.toCsmEmail ?? "—"}`
                          : `status → ${a.toStatus ?? "churned"}`}
                    </td>
                    <td className="px-4 py-2 text-muted">{a.actorEmail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}
