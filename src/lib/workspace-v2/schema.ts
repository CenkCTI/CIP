import { z } from "zod";
import { tiptapDocSchema } from "@/lib/reports/schema";

export const workspaceKinds = ["NOTES", "REPORTS"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

export const folderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\\/]/.test(value), "Folder names cannot contain / or \\.")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Folder names cannot contain control characters.");

export const noteDraftSchema = z
  .object({
    baseRevision: z.number().int().min(0),
    title: z.string().trim().min(1).max(160),
    content: tiptapDocSchema,
  })
  .strict();

export const reportDraftAutosaveSchema = z
  .object({
    baseRevision: z.number().int().min(0),
    title: z.string().trim().min(1).max(200),
    type: z.enum(["TECHNICAL", "EXECUTIVE", "CTI", "AI_SECURITY", "OSINT"]),
    status: z.enum(["DRAFT", "REVIEW", "FINAL"]),
    content: tiptapDocSchema,
  })
  .strict();

const optionalUuid = z.string().uuid().nullable().optional();

export const workspaceMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_folder"),
      kind: z.enum(workspaceKinds),
      name: folderNameSchema,
      parentId: optionalUuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("rename_folder"),
      folderId: z.string().uuid(),
      name: folderNameSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("move_folder"),
      folderId: z.string().uuid(),
      parentId: optionalUuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete_folder"),
      folderId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("create_note"),
      folderId: optionalUuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("move_note"),
      noteId: z.string().uuid(),
      folderId: optionalUuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("delete_note"),
      noteId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("move_report"),
      reportId: z.string().uuid(),
      folderId: optionalUuid,
    })
    .strict(),
]);

export function plainTextFromTiptap(value: unknown) {
  const parsed = tiptapDocSchema.safeParse(value);
  if (!parsed.success) return "";
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
      if (["paragraph", "heading", "blockquote", "codeBlock", "listItem"].includes(String(n.type))) out.push("\n");
    }
  };
  walk(parsed.data);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}
