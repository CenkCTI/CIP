import { NextResponse } from "next/server";
import { loadProjectGraph } from "@/lib/graph/service";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { return NextResponse.json(await loadProjectGraph(id)); }
  catch (e) { if ((e as Error).message === "NEXT_HTTP_ERROR_FALLBACK;404") throw e; return NextResponse.json({ error: "Unable to load graph." }, { status: 500 }); }
}
