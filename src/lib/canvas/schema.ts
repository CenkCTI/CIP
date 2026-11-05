import { z } from "zod";

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000);
export const canvasItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("NOTE"),
  content: z.string().max(8000),
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(180).max(1200),
  height: z.number().finite().min(120).max(900),
  z_index: z.number().int().min(0).max(100_000),
}).strict();

export type CanvasItem = z.infer<typeof canvasItemSchema>;

export const canvasNameSchema = z.string().trim().min(1).max(120);

export const canvasCreateSchema = z.object({
  name: canvasNameSchema,
}).strict();

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

export const canvasIdSchema = z.string().uuid();

export function fromCanvasRow(row: Record<string, unknown>): CanvasItem {
  return canvasItemSchema.parse(row);
}
