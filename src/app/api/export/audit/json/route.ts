import { NextResponse } from "next/server";
import { requireActor } from "@/lib/rbac";
import { auditFilterSchema } from "@/lib/audit-query";
import { iterateAudit } from "@/server/audit";
import { toAuditExportRow } from "@/lib/audit-format";
import { exportFilename } from "@/lib/export-format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Streamed JSON array export of the audit log. */
export async function GET(req: Request) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = auditFilterSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const filter = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("["));
        let first = true;
        for await (const r of iterateAudit(filter)) {
          const chunk =
            (first ? "" : ",") + JSON.stringify(toAuditExportRow(r, r.enterpriseName));
          controller.enqueue(encoder.encode(chunk));
          first = false;
        }
        controller.enqueue(encoder.encode("]"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("json", "activity")}"`,
      "Cache-Control": "no-store",
    },
  });
}
