import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { assertGraphEntity } from "@/lib/graph/service";
import { manualRelationshipSchema } from "@/lib/graph/types";
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params; const ctx = await requireUser();
 const { data: project, error } = await ctx.supabase.from("projects").select("id,owner_id").eq("id", id).single();
 if (error || !project || project.owner_id !== ctx.user.id) return NextResponse.json({ error:"Not found" }, { status:404 });
 const parsed = manualRelationshipSchema.safeParse(await req.json().catch(()=>null)); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid relationship" }, { status:400 });
 await assertGraphEntity(ctx.supabase, id, parsed.data.sourceType, parsed.data.sourceId); await assertGraphEntity(ctx.supabase, id, parsed.data.targetType, parsed.data.targetId);
 const { data, error: insertError } = await ctx.supabase.from("entity_relationships").insert({ project_id:id, source_type:parsed.data.sourceType, source_id:parsed.data.sourceId, target_type:parsed.data.targetType, target_id:parsed.data.targetId, relationship_type:parsed.data.relationshipType, description:parsed.data.description, created_by:ctx.user.id }).select("id").single();
 if (insertError) return NextResponse.json({ error: insertError.code === "23505" ? "This manual relationship already exists." : "Unable to create relationship." }, { status: insertError.code === "23505" ? 409 : 500 });
 return NextResponse.json({ id: data.id }, { status:201 });
}
