import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { manualRelationshipUpdateSchema } from "@/lib/graph/types";

async function owned(id: string, relationshipId: string) {
  const ctx = await requireUser();
  const { data: project } = await ctx.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", id)
    .single();
  if (!project || project.owner_id !== ctx.user.id) return null;
  const { data: relationship } = await ctx.supabase
    .from("entity_relationships")
    .select("id")
    .eq("project_id", id)
    .eq("id", relationshipId)
    .single();
  return relationship ? ctx : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; relationshipId: string }> },
) {
  const { id, relationshipId } = await params;
  const ctx = await owned(id, relationshipId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = manualRelationshipUpdateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid relationship" },
      { status: 400 },
    );
  }
  const { error } = await ctx.supabase
    .from("entity_relationships")
    .update({
      relationship_type: parsed.data.relationshipType,
      description: parsed.data.description,
    })
    .eq("project_id", id)
    .eq("id", relationshipId);
  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "This manual relationship already exists."
            : "Unable to update relationship",
      },
      { status: error.code === "23505" ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; relationshipId: string }> },
) {
  const { id, relationshipId } = await params;
  const ctx = await owned(id, relationshipId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await ctx.supabase
    .from("entity_relationships")
    .delete()
    .eq("project_id", id)
    .eq("id", relationshipId);
  return error
    ? NextResponse.json(
        { error: "Unable to delete relationship" },
        { status: 500 },
      )
    : NextResponse.json({ ok: true });
}
