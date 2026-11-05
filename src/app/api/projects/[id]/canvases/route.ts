import { NextResponse } from "next/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { canvasCreateSchema } from "@/lib/canvas/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await ctx.supabase.from("analysis_canvases")
    .select("id,name,revision,updated_at").eq("project_id", id).order("updated_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Unable to load canvases." }, { status: 500 });
  return NextResponse.json({ canvases: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOwnedProject(id).catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const input = canvasCreateSchema.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid canvas name." }, { status: 400 });
  const { data, error } = await ctx.supabase.from("analysis_canvases")
    .insert({ project_id: id, created_by: ctx.user.id, name: input.data.name })
    .select("id,name,revision").single();
  if (error || !data) return NextResponse.json({ error: "Unable to create canvas." }, { status: 500 });
  return NextResponse.json({ canvas: data }, { status: 201 });
}
