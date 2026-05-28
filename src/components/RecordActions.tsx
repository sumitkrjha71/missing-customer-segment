"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QueueRow } from "@/lib/types";
import { AssignDialog } from "@/components/AssignDialog";

/**
 * Action panel on the record detail page. Opens the same AssignDialog used in
 * the queue, then navigates back to the dashboard once the record is resolved.
 */
export function RecordActions({ record }: { record: QueueRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (record.status === "RESOLVED") {
    return (
      <div className="card bg-green-50 text-sm text-ok">
        Resolved{record.segment ? ` as ${record.segment}` : ""}
        {record.resolvedBy ? ` by ${record.resolvedBy}` : ""}.
      </div>
    );
  }

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        ＋ Assign Customer Segment
      </button>
      {open && (
        <AssignDialog
          record={record}
          onClose={() => setOpen(false)}
          onResolved={() => {
            router.push("/");
            router.refresh();
          }}
          onStale={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
