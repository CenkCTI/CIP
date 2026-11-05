import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { canvasIdSchema, canvasSaveSchema } from "@/lib/canvas/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; canvasId: string }> },
) {
  const { id, canvasId } = await params;
  if (!canvasIdSchema.safeParse(canvasId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Keep request size bounded before schema validation.
  const body = await req.text().catch(() => "");
  if (body.length > 6_000_000) {
    return NextResponse.json({ error: "Canvas payload too large." }, { status: 413 });
  }
  const raw: unknown = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const parsed = canvasSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid canvas mutation." }, { status: 400 });
  }

  const { data, error } = await ctx.supabase.rpc("save_analysis_canvas_v1", {
    p_project_id: id,
    p_canvas_id: canvasId,
    p_base_revision: parsed.data.baseRevision,
    p_request_id: parsed.data.requestId,
    p_items: parsed.data.items,
  });
  if (error) {
    if (error.code === "40001" || error.message.includes("EDIT_CONFLICT")) {
      return NextResponse.json({ error: "EDIT_CONFLICT" }, { status: 409 });
    }
    if (error.code === "42501") return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (error.code === "22023" || error.code === "23514" || error.code === "23502") {
      return NextResponse.json({ error: "Invalid canvas mutation." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save canvas." }, { status: 500 });
  }
  return NextResponse.json({ revision: Number(data) });
}
