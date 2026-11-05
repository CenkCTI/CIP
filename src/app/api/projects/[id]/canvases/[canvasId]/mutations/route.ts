import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  canvasIdSchema, canvasSaveSchema, canvasSceneSaveSchema,
} from "@/lib/canvas/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; canvasId: string }> },
) {
  const { id, canvasId } = await params;
  if (!canvasIdSchema.safeParse(canvasId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  }
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });

  // Validate the entire snapshot before any SQL. No arbitrary item/edge kinds.
  const body = await req.text().catch(() => "");
  if (body.length > 6_000_000) {
    return NextResponse.json({ error: "Canvas payload too large." }, { status: 413, headers: noStore });
  }
  const raw: unknown = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const sceneMode = raw !== null && typeof raw === "object" && "edges" in raw;
  const parsed = sceneMode ? canvasSceneSaveSchema.safeParse(raw) : canvasSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid canvas mutation." }, { status: 400, headers: noStore });
  }

  // Older browser tabs can still save untouched NOTE/ENTITY_REF-only boards.
  // v1 DB RPC refuses any old-client mutation once a frame/relationship exists.
  if (!sceneMode && parsed.data.items.some((item) => item.kind === "FRAME" || item.group_id)) {
    return NextResponse.json({ error: "Upgrade required for organized canvases." },
      { status: 409, headers: noStore });
  }
  const common = {
    p_project_id: id,
    p_canvas_id: canvasId,
    p_base_revision: parsed.data.baseRevision,
    p_request_id: parsed.data.requestId,
    p_items: parsed.data.items,
  };
  const result = sceneMode
    ? await ctx.supabase.rpc("save_analysis_canvas_v2", {
        ...common, p_edges: canvasSceneSaveSchema.parse(raw).edges,
      })
    : await ctx.supabase.rpc("save_analysis_canvas_v1", common);
  if (result.error) {
    const error = result.error;
    if (error.code === "40001" || error.message.includes("EDIT_CONFLICT")) {
      return NextResponse.json({ error: "EDIT_CONFLICT" }, { status: 409, headers: noStore });
    }
    if (error.code === "42501") return NextResponse.json({ error: "Not found" },
      { status: 404, headers: noStore });
    if (["22023", "22P02", "23503", "23514", "23502"].includes(error.code)) {
      return NextResponse.json({ error: "Invalid canvas mutation." },
        { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "Unable to save canvas." },
      { status: 500, headers: noStore });
  }
  return NextResponse.json({ revision: Number(result.data) }, { headers: noStore });
}
