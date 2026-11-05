import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { canvasIdSchema, canvasCreateSchema } from "@/lib/canvas/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; canvasId: string }> };
async function getContext(params: Params["params"]) {
  const { id, canvasId } = await params;
  if (!canvasIdSchema.safeParse(canvasId).success) return null;
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return null;
  const { data: board } = await ctx.supabase.from("analysis_canvases")
    .select("id,name,revision").eq("project_id", id).eq("id", canvasId).maybeSingle();
  if (!board) return null;
  return { ...ctx, canvasId, board };
}

export async function GET(_: Request, { params }: Params) {
  const ctx = await getContext(params);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await ctx.supabase.from("analysis_canvas_items")
    .select("id,kind,content,x,y,width,height,z_index")
    .eq("project_id", ctx.projectId).eq("canvas_id", ctx.canvasId).order("z_index");
  if (error) return NextResponse.json({ error: "Unable to load canvas items." }, { status: 500 });
  return NextResponse.json({ canvas: ctx.board, items: data ?? [] });
}

export async function PATCH(req: Request, { params }: Params) {
  const ctx = await getContext(params);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = canvasCreateSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid canvas name." }, { status: 400 });
  const { error } = await ctx.supabase.from("analysis_canvases").update({ name: input.data.name })
    .eq("project_id", ctx.projectId).eq("id", ctx.canvasId);
  if (error) return NextResponse.json({ error: "Unable to rename canvas." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Params) {
  const ctx = await getContext(params);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await ctx.supabase.from("analysis_canvases").delete()
    .eq("project_id", ctx.projectId).eq("id", ctx.canvasId);
  if (error) return NextResponse.json({ error: "Unable to delete canvas." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
