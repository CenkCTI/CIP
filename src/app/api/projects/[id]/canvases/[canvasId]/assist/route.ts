import { z } from "zod";
import { AiError } from "@/lib/ai/client";
import { byokChat } from "@/lib/ai/byok/client";
import { noStore, readJsonLimited, validateOrigin } from "@/lib/ai/byok/security";
import { parseAiJson } from "@/lib/ai/json";
import { requireResearchByok, withResearchQuota, researchError } from "@/lib/ai/research/server";
import { requireOwnedProject } from "@/lib/projects/ownership";
import {
  buildCanvasAssistMessages,
  canvasAiOutputSchema,
  canvasAssistRequestSchema,
  type CanvasContextItem,
  verifyCanvasAssist,
} from "@/lib/canvas/ai-assist";
import { canvasIdSchema, canvasRelationTypeSchema } from "@/lib/canvas/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; canvasId: string }> };
const uuid = z.string().uuid();
const publicError = (status: number, code: string, error: string) =>
  noStore({ code, error }, { status });

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Context is always hydrated from owner-scoped live DB rows.
 * Never accept source text, asset URLs, arbitrary URLs or model-selected record IDs
 * from the browser. No PDF bytes, Storage paths, keys or BYOK secrets enter output.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    validateOrigin(req);
    const { id, canvasId } = await params;
    if (!uuid.safeParse(id).success || !canvasIdSchema.safeParse(canvasId).success) {
      return publicError(404, "not_found", "Canvas not found.");
    }
    const input = canvasAssistRequestSchema.parse(await readJsonLimited(req, 6500));
    const ctx = await requireOwnedProject(id);

    const { data: board, error: boardError } = await ctx.supabase
      .from("analysis_canvases").select("id,revision,created_by")
      .eq("project_id", id).eq("id", canvasId).maybeSingle();
    if (boardError) return publicError(503, "canvas_unavailable", "Canvas lookup unavailable.");
    if (!board || board.created_by !== ctx.user.id) {
      return publicError(404, "not_found", "Canvas not found.");
    }
    const revision = Number(board.revision);
    if (!Number.isSafeInteger(revision) || revision !== input.expectedRevision) {
      return publicError(409, "EDIT_CONFLICT", "Canvas has changed. Refresh and select again.");
    }

    const { data: itemRows, error: itemError } = await ctx.supabase
      .from("analysis_canvas_items")
      .select("id,kind,content,record_type,record_id")
      .eq("project_id", id).eq("canvas_id", canvasId)
      .in("id", input.selectedItemIds).limit(12);
    if (itemError) return publicError(503, "canvas_unavailable", "Canvas cards unavailable.");
    const byItemId = new Map((itemRows ?? []).map((item) => [String(item.id), item]));
    if (byItemId.size !== input.selectedItemIds.length ||
      input.selectedItemIds.some((itemId) => {
        const row = byItemId.get(itemId);
        return !row || (row.kind !== "NOTE" && row.kind !== "ENTITY_REF");
      })) {
      return publicError(400, "invalid_selection", "Select existing note or record cards from this Canvas.");
    }

    const selectedRows = input.selectedItemIds.map((id) => byItemId.get(id)!);
    const refs = selectedRows.filter((item) =>
      item.kind === "ENTITY_REF" && uuid.safeParse(item.record_id).success &&
      typeof item.record_type === "string");
    const ids = [...new Set(refs.map((item) => String(item.record_id)))];
    const types = [...new Set(refs.map((item) => String(item.record_type)))];
    const entityByKey = new Map<string, Record<string, unknown>>();
    if (ids.length) {
      const { data, error } = await ctx.supabase.from("fusion_inventory_items")
        .select("record_type,record_id,title,summary,preview_text,origin_kind")
        .eq("project_id", id).in("record_id", ids).in("record_type", types).limit(200);
      if (error) return publicError(503, "inventory_unavailable", "Investigation context unavailable.");
      for (const row of data ?? []) {
        entityByKey.set(`${row.record_type}:${row.record_id}`, row as Record<string, unknown>);
      }
    }

    const items: CanvasContextItem[] = selectedRows.map((row) => {
      if (row.kind === "NOTE") {
        return {
          itemId: row.id, kind: "ANALYST_NOTE" as const,
          recordType: "NOTE", title: "Canvas working note",
          excerpt: clean(row.content, 1100),
        };
      }
      const entity = entityByKey.get(`${row.record_type}:${row.record_id}`);
      return entity ? {
        itemId: row.id, kind: "CATALOG_SUMMARY" as const,
        recordType: String(row.record_type),
        title: clean(entity.title, 200) || "Untitled source record",
        excerpt: clean(entity.summary, 700) || clean(entity.preview_text, 700),
      } : {
        itemId: row.id, kind: "UNAVAILABLE" as const,
        recordType: String(row.record_type || "").slice(0, 40),
        title: "Source no longer accessible", excerpt: "",
      };
    });
    if (!items.some((item) => item.excerpt.length >= 8)) {
      return publicError(422, "insufficient_context",
        "Selected cards contain no readable note or catalog preview. Select a card with text.");
    }

    const { data: edgeRows, error: edgeError } = await ctx.supabase
      .from("analysis_canvas_edges")
      .select("source_id,target_id,relation_type,rationale")
      .eq("project_id", id).eq("canvas_id", canvasId).limit(1000);
    if (edgeError) return publicError(503, "canvas_unavailable", "Canvas links unavailable.");

    const selected = new Set(input.selectedItemIds);
    const edges = (edgeRows ?? [])
      .filter((edge) => selected.has(edge.source_id) && selected.has(edge.target_id) &&
        canvasRelationTypeSchema.safeParse(edge.relation_type).success)
      .map((edge) => ({
        source_id: String(edge.source_id), target_id: String(edge.target_id),
        relation_type: canvasRelationTypeSchema.parse(edge.relation_type),
        rationale: clean(edge.rationale, 250),
      }));
    const messages = buildCanvasAssistMessages(input, items, edges);

    // BYOK is explicitly opted into for this request; no background AI and no web calls.
    const credential = await requireResearchByok(ctx);
    const analysis = await withResearchQuota(ctx, JSON.stringify(messages).length, async () => {
      const raw = await byokChat("nvidia_nim", credential.model,
        credential.apiKey, messages, "generation");
      let parsed;
      try { parsed = parseAiJson(raw, canvasAiOutputSchema); }
      catch { throw new AiError("malformed_output"); }
      return verifyCanvasAssist(parsed, items, edges, revision);
    });

    return noStore({ result: analysis, notice: "Analyst review required; no Canvas writes were performed." });
  } catch (error) {
    return researchError(error);
  }
}
