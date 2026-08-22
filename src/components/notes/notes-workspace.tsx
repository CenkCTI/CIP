"use client";

import { useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { WorkspaceExplorer, type ExplorerFolder } from "@/components/document-workspace/workspace-explorer";
import { useAutosave } from "@/components/document-workspace/use-autosave";
import { documentEditorExtensions } from "@/lib/reports/editor-extensions";
import { emptyTiptapDoc, parseJsonDoc } from "@/lib/reports/schema";

export type NoteWorkspaceRow = {
  id: string;
  folder_id: string | null;
  title: string;
  content_doc: unknown;
  edit_revision: number;
};

type Props = {
  projectId: string;
  folders: ExplorerFolder[];
  notes: NoteWorkspaceRow[];
  activeNoteId: string | null;
};

type Draft = { title: string; content: Record<string, unknown> };

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const button = (label: string, active: boolean, action: () => void) => (
    <button
      type="button"
      onClick={action}
      className={`rounded px-2 py-1 text-xs ${active ? "bg-slate-700 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
    >
      {label}
    </button>
  );
  return (
    <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-slate-800 bg-[#172016]/95 px-4 py-2 backdrop-blur">
      {button("H1", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
      {button("H2", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
      {button("H3", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
      <span className="mx-1 border-l border-slate-700" />
      {button("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {button("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {button("•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {button("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {button("Quote", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run())}
      {button("Code", editor.isActive("codeBlock"), () => editor.chain().focus().toggleCodeBlock().run())}
      {button("Link", editor.isActive("link"), () => {
        const previous = editor.getAttributes("link").href as string | undefined;
        const href = window.prompt("HTTP/HTTPS URL", previous ?? "https://");
        if (href === null) return;
        if (!href.trim()) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href: href.trim() }).run();
      })}
      <span className="mx-1 border-l border-slate-700" />
      {button("↶", false, () => editor.chain().focus().undo().run())}
      {button("↷", false, () => editor.chain().focus().redo().run())}
    </div>
  );
}

function SaveState({ status, retry }: { status: string; retry: () => void }) {
  if (status === "error")
    return <button type="button" onClick={retry} className="text-xs text-red-300 hover:text-red-200">Save failed · Retry</button>;
  if (status === "conflict")
    return <button type="button" onClick={() => window.location.reload()} className="text-xs text-amber-300 hover:text-amber-200">Changed elsewhere · Reload</button>;
  return <span className="text-xs text-slate-500">{status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved" : "Saved"}</span>;
}

export function NotesWorkspace({ projectId, folders, notes, activeNoteId }: Props) {
  const active = notes.find((note) => note.id === activeNoteId) ?? notes[0] ?? null;
  const parsed = active ? parseJsonDoc(active.content_doc) : null;
  const initialContent = parsed?.success ? parsed.data as Record<string, unknown> : emptyTiptapDoc as Record<string, unknown>;
  const [title, setTitle] = useState(active?.title ?? "");
  const [content, setContent] = useState<Record<string, unknown>>(initialContent);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: documentEditorExtensions(),
    content: initialContent,
    editorProps: {
      attributes: {
        class: "min-h-[520px] px-8 pb-24 pt-6 text-[15px] leading-7 text-slate-200 outline-none [&_h1]:mb-4 [&_h1]:mt-7 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-600 [&_blockquote]:pl-4 [&_blockquote]:text-slate-400 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-950 [&_pre]:p-3",
      },
    },
    onUpdate: ({ editor: updated }) => setContent(updated.getJSON()),
  });
  const snapshot = useMemo<Draft>(() => ({ title, content }), [title, content]);
  const autosave = useAutosave({
    snapshot,
    initialRevision: Number(active?.edit_revision ?? 0),
    save: async (draft, baseRevision) => {
      if (!active) return { revision: baseRevision };
      const response = await fetch(`/api/projects/${projectId}/notes/${active.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, baseRevision }),
      });
      const payload = (await response.json().catch(() => ({}))) as { revision?: number; error?: string; code?: string };
      if (!response.ok) throw new Error(payload.code === "EDIT_CONFLICT" ? "EDIT_CONFLICT" : payload.error || "Autosave failed.");
      return { revision: Number(payload.revision ?? baseRevision + 1) };
    },
  });

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-[#172016] shadow-2xl">
      <div className="grid min-h-[680px] md:grid-cols-[270px_minmax(0,1fr)]">
        <WorkspaceExplorer
          projectId={projectId}
          kind="NOTES"
          folders={folders}
          documents={notes.map(({ id, folder_id, title }) => ({ id, folder_id, title }))}
          currentDocumentId={active?.id ?? null}
          documentHref={(id) => `/projects/${projectId}?tab=notes&note=${id}`}
        />
        <main className="min-w-0 bg-[#172016]">
          {!active ? (
            <div className="flex min-h-[620px] items-center justify-center text-sm text-slate-500">Create or select a note.</div>
          ) : !parsed?.success ? (
            <div className="m-6 rounded border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">This note contains invalid structured content.</div>
          ) : (
            <>
              <div className="flex items-center gap-4 border-b border-slate-800 px-8 py-5">
                <input
                  aria-label="Note title"
                  className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-600"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled note"
                />
                <SaveState status={autosave.status} retry={() => void autosave.retry()} />
              </div>
              <Toolbar editor={editor} />
              <div className="mx-auto max-w-4xl"><EditorContent editor={editor} /></div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
