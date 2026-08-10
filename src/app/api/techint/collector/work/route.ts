import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTechnicalCollectorWorkUnit } from "@/lib/techint/collection/collector-work-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  runId: z.uuid(),
  leaseToken: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_COLLECTOR_WORK_REQUEST" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await runTechnicalCollectorWorkUnit({
      token,
      runId: parsed.data.runId,
      leaseToken: parsed.data.leaseToken,
    });
    if (!result.authorized) {
      return NextResponse.json({ error: "COLLECTOR_UNAUTHORIZED" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json(result, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "COLLECTOR_WORK_FAILED" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function GET() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
}
