import { NextResponse } from "next/server";
import { runSync } from "@/server/sync";
import { auth } from "@/lib/auth";
import { log } from "@/lib/logger";

// Needs Node runtime (Prisma + raw SQL); not edge.
export const runtime = "nodejs";
// Allow headroom for the Metabase fetch + chunked upsert.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Ingestion entry point.
 *
 * Auth: accepts EITHER
 *   - the Vercel Cron bearer secret (Authorization: Bearer <CRON_SECRET>), or
 *   - a signed-in ADMIN session (so an admin can trigger a manual refresh).
 *
 * Middleware lets this path through, so we enforce auth here explicitly.
 */
export async function GET(req: Request) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const outcome = await runSync();
    return NextResponse.json({ ok: true, ...outcome });
  } catch (err) {
    log.error("sync.route.error", { error: String(err) });
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 502 }, // upstream (Metabase) or DB failure
    );
  }
}

// Vercel Cron issues GET; expose POST too for manual curl/testing convenience.
export const POST = GET;

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;

  // Fall back to an authenticated ADMIN session.
  const session = await auth();
  return session?.user?.role === "ADMIN";
}
