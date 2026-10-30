import { NextResponse } from "next/server";
import { queueStats } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      name: "pagepulse",
      version: "1",
      queue: queueStats(),
      time: new Date().toISOString(),
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } }
  );
}
