"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Board = { id: string; name: string; revision: number; updated_at: string };
export function CanvasDirectory({ projectId, canvases }: { projectId: string; canvases: Board[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function create() {
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/canvases`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled canvas" }),
      });
      if (!response.ok) throw new Error("Unable to create canvas.");
      const payload = await response.json() as { canvas: { id: string } };
      router.push(`/projects/${projectId}/canvas/${payload.canvas.id}`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create canvas."); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this canvas and its working notes? Original Investigation records are not affected.")) return;
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/canvases/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete canvas.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete canvas."); }
  }

  return <div className="space-y-5">
    <form onSubmit={(event) => { event.preventDefault(); startTransition(async () => { await create(); }); }}
      className="flex flex-wrap gap-2 rounded border border-stone-800 bg-[#101518] p-4">
      <input aria-label="Canvas name" className="field max-w-sm flex-1" maxLength={120}
        placeholder="Canvas name" value={name} onChange={(event) => setName(event.target.value)} />
      <button type="submit" disabled={pending} className="citem-button">New blank canvas</button>
    </form>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {canvases.length === 0 ? (
      <div className="rounded border border-dashed border-stone-700 p-12 text-center text-sm text-stone-400">
        No canvases yet. Create a blank canvas when you are ready.
      </div>
    ) : (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {canvases.map((board) => <li key={board.id}
          className="rounded border border-stone-800 bg-[#11171a] p-4">
          <Link href={`/projects/${projectId}/canvas/${board.id}`}
            className="text-base font-medium text-stone-100 hover:text-amber-300">{board.name}</Link>
          <p className="mt-2 text-xs text-stone-500">
            Updated {new Date(board.updated_at).toLocaleString()}
          </p>
          <button type="button" disabled={pending} onClick={() => { startTransition(async () => { await remove(board.id); }); }}
            className="mt-4 text-xs text-red-300 hover:underline">Delete canvas</button>
        </li>)}
      </ul>
    )}
  </div>;
}
