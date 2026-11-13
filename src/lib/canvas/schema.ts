import { z } from "zod";
import { canvasEntityTypeSchema } from "./entity-registry";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
const size = (min: number, max: number) => z.number().finite().min(min).max(max);
const member = z.string().uuid().nullable().optional();
const previewPageSchema = z.number().int().min(1).max(10_000);
const base = {
  id: z.string().uuid(),
  x: coordinate, y: coordinate,
  z_index: z.number().int().min(0).max(100_000),
};
const card = {
  ...base,
  width: size(180, 1200),
  height: size(120, 900),
  group_id: member,
};

/** Working notes remain valid with or without the new nullable membership field. */
const note = z.object({
  ...card,
  kind: z.literal("NOTE"),
  content: z.string().max(8000),
  record_type: z.null().optional(),
  record_id: z.null().optional(),
  preview_page: z.null().optional(),
}).strict();

const entityRef = z.object({
  ...card,
  kind: z.literal("ENTITY_REF"),
  content: z.literal(""),
  record_type: canvasEntityTypeSchema,
  record_id: z.string().uuid(),
  // CANVAS-4: null = ordinary canonical reference, positive = live media preview.
  preview_page: previewPageSchema.nullable().optional(),
}).strict();

/** Single-level visual frames are Canvas-only presentation data, never CTI entities. */
const frame = z.object({
  ...base,
  kind: z.literal("FRAME"),
  content: z.string().trim().min(1).max(120),
  width: size(320, 5000),
  height: size(220, 4000),
  record_type: z.null().optional(),
  record_id: z.null().optional(),
  group_id: z.null().optional(),
  preview_page: z.null().optional(),
}).strict();

export const canvasItemSchema = z.discriminatedUnion("kind", [note, entityRef, frame])
  .superRefine((item, ctx) => {
    if (item.kind === "ENTITY_REF" && item.preview_page != null &&
        item.record_type !== "SOURCE_ASSET") {
      ctx.addIssue({ code: "custom", path: ["preview_page"],
        message: "Only canonical SOURCE_ASSET references can display media" });
    }
  });
export type CanvasItem = z.infer<typeof canvasItemSchema>;

export const canvasRelationTypes = [
  "RELATED_TO", "SUPPORTS", "CONTRADICTS", "DERIVED_FROM", "INVESTIGATE",
] as const;
export const canvasRelationTypeSchema = z.enum(canvasRelationTypes);
export type CanvasRelationType = z.infer<typeof canvasRelationTypeSchema>;

export const canvasEdgeSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
  relation_type: canvasRelationTypeSchema,
  rationale: z.string().max(500),
}).strict();
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasScene = { items: CanvasItem[]; edges: CanvasEdge[] };

export const canvasNameSchema = z.string().trim().min(1).max(120);
export const canvasCreateSchema = z.object({ name: canvasNameSchema }).strict();
export const canvasIdSchema = z.string().uuid();

/** Legacy v1 mutation contract stays available for note-only older clients. */
export const canvasSaveSchema = z.object({
  baseRevision: z.number().int().min(0),
  requestId: z.string().uuid(),
  items: z.array(canvasItemSchema).max(500),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.items.forEach((item, index) => {
    if (ids.has(item.id)) ctx.addIssue({
      code: "custom", path: ["items", index, "id"], message: "Duplicate canvas item ID",
    });
    ids.add(item.id);
  });
});

/** A single atomic snapshot includes cards, frame membership and analyst edges. */
export const canvasSceneSaveSchema = z.object({
  baseRevision: z.number().int().min(0),
  requestId: z.string().uuid(),
  items: z.array(canvasItemSchema).max(500),
  edges: z.array(canvasEdgeSchema).max(1000),
}).strict().superRefine((value, ctx) => {
  const nodes = new Map<string, CanvasItem>();
  value.items.forEach((item, index) => {
    if (nodes.has(item.id)) ctx.addIssue({
      code: "custom", path: ["items", index, "id"], message: "Duplicate canvas node ID",
    });
    nodes.set(item.id, item);
  });
  value.items.forEach((item, index) => {
    if (item.kind === "FRAME") return;
    if (item.group_id && nodes.get(item.group_id)?.kind !== "FRAME") {
      ctx.addIssue({
        code: "custom", path: ["items", index, "group_id"],
        message: "Members can only belong to a frame on the same canvas",
      });
    }
  });
  const edgeIds = new Set<string>();
  value.edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id)) ctx.addIssue({
      code: "custom", path: ["edges", index, "id"], message: "Duplicate edge ID",
    });
    edgeIds.add(edge.id);
    if (edge.source_id === edge.target_id ||
      !nodes.has(edge.source_id) || !nodes.has(edge.target_id) ||
      nodes.get(edge.source_id)?.kind === "FRAME" ||
      nodes.get(edge.target_id)?.kind === "FRAME") {
      ctx.addIssue({
        code: "custom", path: ["edges", index],
        message: "Edges must join two different cards on this canvas",
      });
    }
  });
});

export function fromCanvasRow(row: Record<string, unknown>): CanvasItem {
  return canvasItemSchema.parse(row);
}
export function fromCanvasEdgeRow(row: Record<string, unknown>): CanvasEdge {
  return canvasEdgeSchema.parse(row);
}
