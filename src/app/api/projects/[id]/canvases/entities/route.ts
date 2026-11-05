import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  canvasEntityFromFusionRow, canvasEntityKey, canvasEntityTypeSchema,
} from "@/lib/canvas/entity-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SEARCH_LIMIT = 20;
const columns = "record_type,record_id,title,summary,preview_text,origin_kind,source_ids,metadata,updated_at";
const ref = z.object({
  recordType: canvasEntityTypeSchema,
  recordId: z.string().uuid(),
}).strict();

const searchSchema = z.object({
  q: z.string().trim().max(120),
  type: canvasEntityTypeSchema.optional(),
  page: z.coerce.number().int().min(1).max(50),
});

async function owner(projectId: string) {
  return requireOwnedProject(projectId).catch(() => null);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await owner(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

  const url = new URL(req.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    type: url.searchParams.get("type") || undefined,
    page: url.searchParams.get("page") ?? "1",
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid search filters" }, { status: 400, headers: NO_STORE });

  const { q, type, page } = parsed.data;
  let query = ctx.supabase.from("fusion_inventory_items")
    .select(columns)
    .eq("project_id", id);
  if (type) query = query.eq("record_type", type);
  if (q) {
    // Keep user-entered IOC punctuation, but treat SQL LIKE operators literally.
    const escaped = q.replace(/[%_\\]/g, (char) => "\\" + char);
    query = query.ilike("title", `%${escaped}%`);
  }
  const { data, error } = await query.order("updated_at", { ascending: false })
    .order("record_type").order("record_id")
    .range((page - 1) * SEARCH_LIMIT, page * SEARCH_LIMIT);
  if (error) return NextResponse.json({ error: "Entity search unavailable" }, { status: 503, headers: NO_STORE });
  const items = (data ?? []).slice(0, SEARCH_LIMIT)
    .map((row) => canvasEntityFromFusionRow(id, row as Record<string, unknown>))
    .filter((item) => item !== null);
  return NextResponse.json({ items, hasMore: (data ?? []).length > SEARCH_LIMIT, page },
    { headers: NO_STORE });
}

/** Resolve only exact, typed references. There is no arbitrary table/SQL name in the request. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await owner(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  const body = await req.text().catch(() => "");
  if (body.length > 40_000) {
    return NextResponse.json({ error: "Reference batch too large" }, { status: 413, headers: NO_STORE });
  }
  const json: unknown = (() => { try { return JSON.parse(body); } catch { return null; } })();
  const input = z.object({ refs: z.array(ref).max(100) }).strict().safeParse(json);
  if (!input.success) {
    return NextResponse.json({ error: "Invalid reference batch" }, { status: 400, headers: NO_STORE });
  }
  const unique = [...new Map(input.data.refs.map((item) => [canvasEntityKey(item), item])).values()];
  if (!unique.length) return NextResponse.json({ items: [], missing: [] }, { headers: NO_STORE });
  const ids = [...new Set(unique.map((item) => item.recordId))];
  const types = [...new Set(unique.map((item) => item.recordType))];
  const { data, error } = await ctx.supabase.from("fusion_inventory_items")
    .select(columns).eq("project_id", id)
    .in("record_id", ids).in("record_type", types).limit(1000);
  if (error) return NextResponse.json({ error: "Entity resolution unavailable" }, { status: 503, headers: NO_STORE });
  const allowed = new Set(unique.map(canvasEntityKey));
  const found = (data ?? [])
    .map((row) => canvasEntityFromFusionRow(id, row as Record<string, unknown>))
    .filter((item) => item !== null && allowed.has(canvasEntityKey(item)));
  const matches = new Set(found.map(canvasEntityKey));
  const missing = unique.filter((item) => !matches.has(canvasEntityKey(item)));
  return NextResponse.json({ items: found, missing }, { headers: NO_STORE });
}
