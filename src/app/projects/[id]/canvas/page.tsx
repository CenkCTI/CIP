import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { CanvasDirectory } from "@/components/canvas/canvas-directory";

export default async function CanvasListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id).catch(() => notFound());
  const { data, error } = await ctx.supabase.from("analysis_canvases")
    .select("id,name,revision,updated_at").eq("project_id", id)
    .order("updated_at", { ascending: false }).limit(100);
  return (
    <section className="mx-auto max-w-6xl space-y-5 px-4 pb-10">
      <header className="rounded border border-stone-800 bg-[#0f1417] p-5">
        <p className="citem-label">Investigation workspace</p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-100">Analysis Canvas</h1>
        <p className="mt-2 text-sm text-stone-400">Create an empty research surface, add working notes, and arrange your thinking. Source records remain unchanged.</p>
        <Link href={`/projects/${id}`} className="mt-3 inline-block text-xs text-amber-300 hover:underline">Back to Investigation</Link>
      </header>
      {error ? (
        <p role="alert" className="rounded border border-red-900/60 p-4 text-sm text-red-300">
          Canvas storage is not available. Apply the CANVAS-1 migration before using this workspace.
        </p>
      ) : (
        <CanvasDirectory projectId={id} canvases={data ?? []} />
      )}
    </section>
  );
}
