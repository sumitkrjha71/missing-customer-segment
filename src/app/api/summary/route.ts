import { NextResponse } from "next/server";
import { requireActor } from "@/lib/rbac";
import { getSummary } from "@/server/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireActor();
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const summary = await getSummary();
  return NextResponse.json({ ok: true, ...summary });
}
