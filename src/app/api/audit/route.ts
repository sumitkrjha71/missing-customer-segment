import { NextResponse } from "next/server";
import { requireActor } from "@/lib/rbac";
import { auditFilterSchema } from "@/lib/audit-query";
import { getAuditFeed } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paged audit feed for the Activity Log tab. */
export async function GET(req: Request) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = auditFilterSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rows, nextCursor, total } = await getAuditFeed(parsed.data);

  return NextResponse.json({
    ok: true,
    total,
    nextCursor,
    rows: rows.map((r) => ({
      id: r.id,
      enterpriseId: r.enterpriseId,
      enterpriseName: r.enterpriseName,
      action: r.action,
      fromSegment: r.fromSegment,
      toSegment: r.toSegment,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      fromCsmEmail: r.fromCsmEmail,
      toCsmEmail: r.toCsmEmail,
      actorEmail: r.actorEmail,
      createdAt: r.createdAt,
    })),
  });
}
