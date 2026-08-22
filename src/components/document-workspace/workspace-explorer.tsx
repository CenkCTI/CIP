"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type ExplorerFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: "NOTES" | "REPORTS";
};

export type ExplorerDocument = {
  id: string;
  folder_id: string | null;
  title: string;
};

type Props = {
  projectId: string;
  kind: "NOTES" | "REPORTS";
  folders: ExplorerFolder[];
  documents: ExplorerDocument[];
  currentDocumentId?: string | null;
  documentHref: (id: string) => string;
};

async function mutate(projectId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/projects/${projectId}/workspace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
  if (!response.ok) throw new Error(payload.error || "Workspace change failed.");
  return payload;
}

export function WorkspaceExplorer({
  projectId,
  kind,
  folders,
  documents,
  currentDocumentId,
  documentHref,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders.map((f) => f.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byParent = useMemo(() => {
    const map = new Map<string | null, ExplorerFolder[]>();
    for (const folder of folders) {
      const list = map.get(folder.parent_id) ?? [];
      list.push(folder);
      map.set(folder.parent_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [folders]);
  const docsByFolder = useMemo(() => {
    const map = new Map<string | null, ExplorerDocument[]>();
    for (const doc of documents) {
      const list = map.get(doc.folder_id) ?? [];
      list.push(doc);
      map.set(doc.folder_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title));
    return map;
  }, [documents]);

  const run = async (body: Record<string, unknown>, after?: (payload: { id?: string }) => void) => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutate(projectId, body);
      after?.(result);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace change failed.");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = (parentId: string | null) => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    void run({ action: "create_folder", kind, parentId, name: name.trim() });
  };

  const createNote = (folderId: string | null) => {
    void run({ action: "create_note", folderId }, (result) => {
      if (result.id) router.push(`/projects/${projectId}?tab=notes&note=${result.id}`);
    });
  };

  const moveDocument = (document: ExplorerDocument, folderId: string | null) => {
    void run(
      kind === "NOTES"
        ? { action: "move_note", noteId: document.id, folderId }
        : { action: "move_report", reportId: document.id, folderId },
    );
  };

  const renderDocument = (document: ExplorerDocument, depth: number) => (
    <div
      key={document.id}
      className={`group flex items-center gap-1 rounded px-1 ${currentDocumentId === document.id ? "bg-slate-800 text-amber-200" : "text-slate-300 hover:bg-slate-900"}`}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
    >
      <Link href={documentHref(document.id)} className="min-w-0 flex-1 truncate py-1.5 text-sm">
        <span className="mr-2 text-slate-500">▤</span>{document.title}
      </Link>
      <details className="relative">
        <summary className="cursor-pointer list-none rounded px-1 text-slate-500 hover:text-white">⋯</summary>
        <div className="absolute right-0 z-30 w-48 rounded border border-slate-700 bg-slate-950 p-2 shadow-xl">
          <label className="block text-xs text-slate-400">Move to</label>
          <select
            className="field mt-1 w-full text-xs"
            value={document.folder_id ?? ""}
            onChange={(event) => moveDocument(document, event.target.value || null)}
            disabled={busy}
          >
            <option value="">Root</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          {kind === "NOTES" && (
            <button
              type="button"
              className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-red-300 hover:bg-red-950/40"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete note “${document.title}”?`))
                  void run({ action: "delete_note", noteId: document.id }, () => {
                    if (currentDocumentId === document.id) router.push(`/projects/${projectId}?tab=notes`);
                  });
              }}
            >
              Delete note
            </button>
          )}
        </div>
      </details>
    </div>
  );

  const renderFolder = (folder: ExplorerFolder, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(folder.id);
    const children = byParent.get(folder.id) ?? [];
    const childDocs = docsByFolder.get(folder.id) ?? [];
    return (
      <div key={folder.id}>
        <div className="group flex items-center rounded text-slate-300" style={{ paddingLeft: `${depth * 14}px` }}>
          <button
            type="button"
            className="w-6 py-1.5 text-xs text-slate-500"
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            onClick={() => setExpanded((current) => {
              const next = new Set(current);
              if (next.has(folder.id)) next.delete(folder.id); else next.add(folder.id);
              return next;
            })}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <span className="mr-2 text-amber-500/80">▰</span>
          <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded px-1 text-slate-600 hover:text-white">⋯</summary>
            <div className="absolute right-0 z-30 w-52 rounded border border-slate-700 bg-slate-950 p-2 shadow-xl">
              {kind === "NOTES" && <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-800" disabled={busy} onClick={() => createNote(folder.id)}>New note here</button>}
              <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-800" disabled={busy} onClick={() => createFolder(folder.id)}>New subfolder</button>
              <button type="button" className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-800" disabled={busy} onClick={() => {
                const name = window.prompt("Rename folder", folder.name);
                if (name?.trim() && name.trim() !== folder.name) void run({ action: "rename_folder", folderId: folder.id, name: name.trim() });
              }}>Rename</button>
              <label className="mt-2 block px-2 text-[11px] text-slate-500">Move folder to</label>
              <select
                className="field mt-1 w-full text-xs"
                value={folder.parent_id ?? ""}
                disabled={busy}
                onChange={(event) => void run({ action: "move_folder", folderId: folder.id, parentId: event.target.value || null })}
              >
                <option value="">Root</option>
                {folders.filter((candidate) => candidate.id !== folder.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
              <button type="button" className="mt-2 block w-full rounded px-2 py-1 text-left text-xs text-red-300 hover:bg-red-950/40" disabled={busy} onClick={() => {
                if (window.confirm(`Delete empty folder “${folder.name}”?`)) void run({ action: "delete_folder", folderId: folder.id });
              }}>Delete empty folder</button>
            </div>
          </details>
        </div>
        {isExpanded && (
          <div>
            {children.map((child) => renderFolder(child, depth + 1))}
            {childDocs.map((doc) => renderDocument(doc, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = byParent.get(null) ?? [];
  const rootDocs = docsByFolder.get(null) ?? [];

  return (
    <aside className="flex h-full min-h-[620px] flex-col border-r border-slate-800 bg-[#111810]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold tracking-[0.16em] text-slate-400">FILES</span>
        <div className="flex gap-1">
          {kind === "NOTES" && <button type="button" title="New note" className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" disabled={busy} onClick={() => createNote(null)}>＋▤</button>}
          <button type="button" title="New folder" className="rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" disabled={busy} onClick={() => createFolder(null)}>＋▰</button>
        </div>
      </div>
      {error && <div className="border-b border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {rootFolders.map((folder) => renderFolder(folder, 0))}
        {rootDocs.map((doc) => renderDocument(doc, 0))}
        {!folders.length && !documents.length && <p className="px-2 py-8 text-center text-sm text-slate-500">No files yet.</p>}
      </div>
    </aside>
  );
}
