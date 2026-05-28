import { NextResponse } from "next/server";
import { requireActor } from "@/lib/rbac";
import { queueFilterSchema } from "@/lib/validate";
import { iterateRecords, scopeTag } from "@/server/export";
import {
  csvHeaderLine,
  csvLine,
  exportFilename,
  toExportRow,
} from "@/lib/export-format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Streamed CSV export. Bytes flush as rows are produced — memory-safe at scale. */
export async function GET(req: Request) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = queueFilterSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const filter = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(csvHeaderLine()));
        for await (const rec of iterateRecords(filter)) {
          controller.enqueue(encoder.encode(csvLine(toExportRow(rec))));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("csv", scopeTag(filter))}"`,
      "Cache-Control": "no-store",
    },
  });
}
