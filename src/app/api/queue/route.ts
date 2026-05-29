import { NextResponse } from "next/server";
import { requireActor } from "@/lib/rbac";
import { queueFilterSchema } from "@/lib/validate";
import { getQueuePage } from "@/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Paged, filtered queue. Used by the client-side table for pagination/search. */
export async function GET(req: Request) {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = queueFilterSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "bad_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { rows, nextCursor, total } = await getQueuePage(parsed.data);

  return NextResponse.json({
    ok: true,
    total,
    nextCursor,
    rows: rows.map((r) => ({
      enterpriseId: r.enterpriseId,
      enterpriseName: r.enterpriseName,
      csmName: r.csmName,
      csmEmail: r.csmEmail,
      accountStatus: r.accountStatus,
      stage: r.stage,
      segment: r.segment,
      status: r.status,
      version: r.version,
      uniqueQcImages: r.uniqueQcImages,
      lastImageReceivedAt: r.lastImageReceivedAt,
      firstSeenAt: r.firstSeenAt,
      sourceUpdatedAt: r.sourceUpdatedAt,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
    })),
  });
}
