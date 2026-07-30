import { NextResponse } from "next/server";
import { loadProjectGraph } from "@/lib/graph/service";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { const historical = new URL(request.url).searchParams.get("historical") === "true"; return NextResponse.json(historical ? await loadProjectGraph(id, true) : await loadProjectGraph(id)); }
  catch (e) { if ((e as Error).message === "NEXT_HTTP_ERROR_FALLBACK;404") throw e; return NextResponse.json({ error: "Unable to load graph." }, { status: 500 }); }
}
