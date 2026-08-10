import { NextRequest, NextResponse } from "next/server";
import { runTechnicalCollectorTick } from "@/lib/techint/collection/collector-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header);
  return match?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "COLLECTOR_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await runTechnicalCollectorTick(token);
    if (!result.authorized) {
      return NextResponse.json({ error: "COLLECTOR_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(result, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "COLLECTOR_TICK_FAILED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function GET() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}
