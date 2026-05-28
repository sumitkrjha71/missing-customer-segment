import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireActor } from "@/lib/rbac";
import { auditFilterSchema } from "@/lib/audit-query";
import { iterateAudit } from "@/server/audit";
import {
  AUDIT_EXPORT_COLUMNS,
  toAuditExportRow,
} from "@/lib/audit-format";
import { exportFilename } from "@/lib/export-format";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** XLSX export of the audit log (in-memory; see note in /api/export/xlsx). */
async function handle(req: Request) {
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Segment Ops";
  wb.created = new Date();
  const ws = wb.addWorksheet("activity", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = AUDIT_EXPORT_COLUMNS.map((c) => ({
    header: c,
    key: c,
    width: Math.max(14, c.length + 2),
  }));
  ws.getRow(1).font = { bold: true };

  for await (const r of iterateAudit(filter)) {
    ws.addRow(toAuditExportRow(r, r.enterpriseName));
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename("xlsx", "activity")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;
