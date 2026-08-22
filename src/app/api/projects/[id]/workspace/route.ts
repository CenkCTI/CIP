import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { emptyTiptapDoc } from "@/lib/reports/schema";
import { workspaceMutationSchema, type WorkspaceKind } from "@/lib/workspace-v2/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function projectContext(id: string) {
  const { supabase, user } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", id)
    .single();
  if (error || !project || project.owner_id !== user.id) return null;
  return { supabase, user };
}

async function folderExists(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  projectId: string,
  folderId: string | null | undefined,
  kind: WorkspaceKind,
) {
  if (!folderId) return true;
  const { data, error } = await supabase
    .from("workspace_folders")
    .select("id")
    .eq("project_id", projectId)
    .eq("id", folderId)
    .eq("kind", kind)
    .maybeSingle();
  return !error && Boolean(data);
}

function dbError(message = "Workspace change could not be saved.", status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = workspaceMutationSchema.safeParse(await req.json());
    if (!parsed.success) return dbError("Invalid workspace change.");
    const ctx = await projectContext(id);
    if (!ctx) return dbError("Project not found.", 404);
    const { supabase, user } = ctx;
    const body = parsed.data;

    if (body.action === "create_folder") {
      if (!(await folderExists(supabase, id, body.parentId, body.kind)))
        return dbError("Parent folder not found.");
      const { data, error } = await supabase
        .from("workspace_folders")
        .insert({
          project_id: id,
          kind: body.kind,
          parent_id: body.parentId ?? null,
          name: body.name,
        })
        .select("id,project_id,kind,parent_id,name")
        .single();
      if (error || !data) return dbError("A folder with that name may already exist here.", 409);
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, folder: data });
    }

    if (body.action === "rename_folder") {
      const { data, error } = await supabase
        .from("workspace_folders")
        .update({ name: body.name })
        .eq("project_id", id)
        .eq("id", body.folderId)
        .select("id")
        .single();
      if (error || !data) return dbError("Folder could not be renamed.", 409);
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move_folder") {
      const { data: folder } = await supabase
        .from("workspace_folders")
        .select("id,kind")
        .eq("project_id", id)
        .eq("id", body.folderId)
        .single();
      if (!folder) return dbError("Folder not found.", 404);
      if (!(await folderExists(supabase, id, body.parentId, folder.kind as WorkspaceKind)))
        return dbError("Destination folder not found.");
      const { data, error } = await supabase
        .from("workspace_folders")
        .update({ parent_id: body.parentId ?? null })
        .eq("project_id", id)
        .eq("id", body.folderId)
        .select("id")
        .single();
      if (error || !data) return dbError("Folder cannot be moved there.", 409);
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_folder") {
      const { error } = await supabase
        .from("workspace_folders")
        .delete()
        .eq("project_id", id)
        .eq("id", body.folderId);
      if (error) return dbError("Folder is not empty. Move or delete its contents first.", 409);
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "create_note") {
      if (!(await folderExists(supabase, id, body.folderId, "NOTES")))
        return dbError("Destination folder not found.");
      const { data, error } = await supabase
        .from("research_notes")
        .insert({
          project_id: id,
          author_id: user.id,
          folder_id: body.folderId ?? null,
          title: "Untitled note",
          content: "",
          content_doc: emptyTiptapDoc,
        })
        .select("id")
        .single();
      if (error || !data) return dbError("Note could not be created.");
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (body.action === "move_note") {
      if (!(await folderExists(supabase, id, body.folderId, "NOTES")))
        return dbError("Destination folder not found.");
      const { data, error } = await supabase
        .from("research_notes")
        .update({ folder_id: body.folderId ?? null })
        .eq("project_id", id)
        .eq("id", body.noteId)
        .select("id")
        .single();
      if (error || !data) return dbError("Note could not be moved.");
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_note") {
      const { error } = await supabase
        .from("research_notes")
        .delete()
        .eq("project_id", id)
        .eq("id", body.noteId);
      if (error) return dbError("Note could not be deleted.");
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "move_report") {
      if (!(await folderExists(supabase, id, body.folderId, "REPORTS")))
        return dbError("Destination folder not found.");
      const { data, error } = await supabase
        .from("reports")
        .update({ folder_id: body.folderId ?? null })
        .eq("project_id", id)
        .eq("id", body.reportId)
        .select("id")
        .single();
      if (error || !data) return dbError("Report could not be moved.");
      revalidatePath(`/projects/${id}`);
      return NextResponse.json({ ok: true });
    }

    return dbError();
  } catch {
    return dbError("Workspace change could not be saved.");
  }
}
