import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireActor } from "@/lib/rbac";
import { queueFilterSchema } from "@/lib/validate";
import { iterateRecords, scopeTag } from "@/server/export";
import { EXPORT_COLUMNS, exportFilename, toExportRow } from "@/lib/export-format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * XLSX export.
 *
 * Unlike CSV/JSON, XLSX is a ZIP whose central directory is written last, so it
 * can't be HTTP-streamed row-by-row. We build the workbook in memory and return
 * it as one download. At the stated scale (tens of thousands × ~12 cols) this is
 * comfortably within the function memory limit.
 *
 * Growth seam: if the dataset ever approaches the memory ceiling, switch to
 * exceljs' streaming WorkbookWriter → Vercel Blob → signed URL (see plan §14).
 *
 * GET (browser link) and POST (programmatic) both supported.
 */
async function handle(req: Request) {
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Segment Ops";
  wb.created = new Date();
  const ws = wb.addWorksheet("segments", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = EXPORT_COLUMNS.map((c) => ({
    header: c,
    key: c,
    width: Math.max(14, c.length + 2),
  }));
  ws.getRow(1).font = { bold: true };

  for await (const rec of iterateRecords(filter)) {
    ws.addRow(toExportRow(rec));
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename("xlsx", scopeTag(filter))}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;
