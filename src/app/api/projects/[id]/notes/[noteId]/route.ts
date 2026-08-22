import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { noteDraftSchema, plainTextFromTiptap } from "@/lib/workspace-v2/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const { id, noteId } = await params;
    const parsed = noteDraftSchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: "Invalid note draft." }, { status: 400 });

    const plainText = plainTextFromTiptap(parsed.data.content);
    if (plainText.length > 50_000)
      return NextResponse.json({ error: "Note text is too large." }, { status: 400 });

    const { supabase, user } = await requireUser();
    const { data: project } = await supabase
      .from("projects")
      .select("id,owner_id")
      .eq("id", id)
      .single();
    if (!project || project.owner_id !== user.id)
      return NextResponse.json({ error: "Note not found." }, { status: 404 });

    const nextRevision = parsed.data.baseRevision + 1;
    const { data, error } = await supabase
      .from("research_notes")
      .update({
        title: parsed.data.title,
        content: plainText,
        content_doc: parsed.data.content,
        content_schema_version: 1,
        edit_revision: nextRevision,
      })
      .eq("project_id", id)
      .eq("id", noteId)
      .eq("author_id", user.id)
      .eq("edit_revision", parsed.data.baseRevision)
      .select("edit_revision,updated_at")
      .maybeSingle();

    if (error)
      return NextResponse.json({ error: "Note could not be saved." }, { status: 400 });
    if (!data)
      return NextResponse.json(
        { error: "This note changed elsewhere. Reload it before continuing.", code: "EDIT_CONFLICT" },
        { status: 409 },
      );

    revalidatePath(`/projects/${id}`);
    return NextResponse.json({
      ok: true,
      revision: data.edit_revision,
      savedAt: data.updated_at,
    });
  } catch {
    return NextResponse.json({ error: "Note could not be saved." }, { status: 400 });
  }
}
