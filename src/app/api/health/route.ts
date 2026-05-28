import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + DB connectivity. Public (no PII); used by uptime monitors. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", t: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "down", error: String(err) },
      { status: 503 },
    );
  }
}
