import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertGraphEntities } from "@/lib/graph/service";
import { graphLayoutPatchSchema } from "@/lib/graph/types";

async function requireOwnedProject(projectId: string) {
  const ctx = await requireUser();
  const { data: project, error } = await ctx.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", projectId)
    .single();
  if (error || !project || project.owner_id !== ctx.user.id) return null;
  return ctx;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await ctx.supabase
    .from("graph_node_positions")
    .select("entity_type,entity_id,position_x,position_y")
    .eq("project_id", id)
    .eq("user_id", ctx.user.id)
    .order("entity_type", { ascending: true })
    .order("entity_id", { ascending: true });
  if (error)
    return NextResponse.json(
      { error: "Unable to load graph layout." },
      { status: 500 },
    );
  return NextResponse.json({
    positions: (data ?? []).map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      x: row.position_x,
      y: row.position_y,
    })),
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = graphLayoutPatchSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid layout." },
      { status: 400 },
    );
  try {
    await assertGraphEntities(ctx.supabase, id, parsed.data.positions);
  } catch (error) {
    if ((error as Error).message === "NEXT_HTTP_ERROR_FALLBACK;404") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
  const rows = parsed.data.positions.map((position) => ({
    project_id: id,
    user_id: ctx.user.id,
    entity_type: position.entityType,
    entity_id: position.entityId,
    position_x: position.x,
    position_y: position.y,
  }));
  const { error } = await ctx.supabase
    .from("graph_node_positions")
    .upsert(rows, { onConflict: "project_id,user_id,entity_type,entity_id" });
  if (error)
    return NextResponse.json(
      { error: "Unable to save graph layout." },
      { status: 500 },
    );
  return NextResponse.json({ saved: rows.length });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await ctx.supabase
    .from("graph_node_positions")
    .delete()
    .eq("project_id", id)
    .eq("user_id", ctx.user.id);
  if (error)
    return NextResponse.json(
      { error: "Unable to reset graph layout." },
      { status: 500 },
    );
  return NextResponse.json({ reset: true });
}
