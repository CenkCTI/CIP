import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { canvasIdSchema, fromCanvasRow, fromCanvasEdgeRow } from "@/lib/canvas/schema";
import { CanvasWorkspace } from "@/components/canvas/canvas-workspace";

export default async function CanvasDetailPage({
  params,
}: {
  params: Promise<{ id: string; canvasId: string }>;
}) {
  const { id, canvasId } = await params;
  if (!canvasIdSchema.safeParse(canvasId).success) notFound();
  const ctx = await requireOwnedProject(id).catch(() => notFound());
  const { data: canvas } = await ctx.supabase.from("analysis_canvases")
    .select("id,name,revision").eq("project_id", id).eq("id", canvasId).maybeSingle();
  if (!canvas) notFound();
  const [nodes, relationships] = await Promise.all([
    ctx.supabase.from("analysis_canvas_items")
      .select("id,kind,content,x,y,width,height,z_index,record_type,record_id,group_id")
      .eq("project_id", id).eq("canvas_id", canvasId).order("z_index"),
    ctx.supabase.from("analysis_canvas_edges")
      .select("id,source_id,target_id,relation_type,rationale")
      .eq("project_id", id).eq("canvas_id", canvasId).order("created_at"),
  ]);
  if (nodes.error || relationships.error) throw new Error("Unable to load canvas scene.");
  const items = (nodes.data ?? []).map((row) => fromCanvasRow(row));
  const edges = (relationships.data ?? []).map((row) => fromCanvasEdgeRow(row));
  return (
    <section className="mx-auto max-w-[1700px] px-3 pb-6">
      <nav className="mb-3 flex items-center gap-2 text-xs text-stone-400">
        <Link href={`/projects/${id}/canvas`} className="hover:text-amber-300">All canvases</Link>
        <span>/</span>
        <span className="truncate text-stone-200">{canvas.name}</span>
      </nav>
      <CanvasWorkspace projectId={id} canvasId={canvas.id} name={canvas.name}
        initialItems={items} initialEdges={edges} initialRevision={Number(canvas.revision)} />
    </section>
  );
}
