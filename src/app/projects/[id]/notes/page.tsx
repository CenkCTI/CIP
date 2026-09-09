import Link from "next/link";
import { notFound } from "next/navigation";
import { NotesWorkspace, type NoteWorkspaceRow } from "@/components/notes/notes-workspace";
import type { ExplorerFolder } from "@/components/document-workspace/workspace-explorer";
import { requireUser } from "@/lib/auth";

type SearchParams = { note?: string };

export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,owner_id")
    .eq("id", id)
    .single();
  if (projectError || !project || project.owner_id !== user.id) notFound();

  const [{ data: folders, error: foldersError }, { data: noteMetadata, error: notesError }] =
    await Promise.all([
      supabase
        .from("workspace_folders")
        .select("id,parent_id,name,kind")
        .eq("project_id", id)
        .eq("kind", "NOTES")
        .order("name"),
      supabase
        .from("research_notes")
        .select("id,folder_id,title,edit_revision,updated_at")
        .eq("project_id", id)
        .order("title"),
    ]);

  if (foldersError || notesError)
    return (
      <section className="mx-auto max-w-6xl">
        <Link href={`/projects/${id}`} className="text-sm text-amber-300">← Investigation</Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load Notes workspace. Apply migration 052 and refresh.
        </div>
      </section>
    );

  const metadata = (noteMetadata ?? []) as unknown as NoteWorkspaceRow[];
  const requested = sp.note && metadata.some((note) => note.id === sp.note) ? sp.note : null;
  const activeNoteId = requested ?? metadata[0]?.id ?? null;
  let noteRows = metadata;

  if (activeNoteId) {
    const { data: activeNote, error: activeError } = await supabase
      .from("research_notes")
      .select("id,content_doc")
      .eq("project_id", id)
      .eq("id", activeNoteId)
      .single();
    if (activeError || !activeNote) notFound();
    noteRows = metadata.map((note) =>
      note.id === activeNoteId ? { ...note, content_doc: activeNote.content_doc } : note,
    );
  }

  return (
    <section className="mx-auto max-w-[1500px] px-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href={`/projects/${id}`} className="text-sm text-amber-300 hover:text-amber-200">← Investigation</Link>
          <h1 className="mt-2 text-3xl font-bold text-white">{project.name} · Notes</h1>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">Folders · notes · autosave</p>
      </div>
      <NotesWorkspace
        key={activeNoteId ?? "empty"}
        projectId={id}
        folders={(folders ?? []) as unknown as ExplorerFolder[]}
        notes={noteRows}
        activeNoteId={activeNoteId}
      />
    </section>
  );
}
