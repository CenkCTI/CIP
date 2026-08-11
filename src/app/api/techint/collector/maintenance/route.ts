import { NextRequest, NextResponse } from "next/server";
import { runTechnicalAnalysisMaintenance } from "@/lib/techint/analysis/maintenance-runtime";
import { runTechnicalHistoryMaintenance } from "@/lib/techint/history/maintenance-runtime";

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
    const history = await runTechnicalHistoryMaintenance(token);
    if (!history.authorized) {
      return NextResponse.json({ error: "COLLECTOR_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
    }

    let analysis: Awaited<ReturnType<typeof runTechnicalAnalysisMaintenance>> | { authorized: true; error: "ANALYSIS_MAINTENANCE_FAILED" };
    try {
      analysis = await runTechnicalAnalysisMaintenance(token);
      if (!analysis.authorized) {
        return NextResponse.json({ error: "COLLECTOR_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
      }
    } catch {
      // Phase 2.3F-D analysis is derived state. Its failure must never fail collection or corrupt Phase 2.3F-B history maintenance.
      analysis = { authorized: true, error: "ANALYSIS_MAINTENANCE_FAILED" };
    }

    return NextResponse.json({ ...history, analysis }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "HISTORY_MAINTENANCE_FAILED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function GET() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}
