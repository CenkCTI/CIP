import { z } from "zod";

export const reportTypes = ["TECHNICAL", "EXECUTIVE", "CTI", "AI_SECURITY", "OSINT"] as const;
export const reportStatuses = ["DRAFT", "REVIEW", "FINAL"] as const;
export type ReportType = (typeof reportTypes)[number];
export type ReportStatus = (typeof reportStatuses)[number];

export const REPORT_LIMITS = { maxBytes: 250_000, maxNodes: 2_000, maxDepth: 30, maxTextChars: 120_000, maxTextNodeChars: 10_000 } as const;
const nodeTypes = ["doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "hardBreak", "table", "tableRow", "tableCell", "tableHeader"] as const;
const markTypes = ["bold", "italic", "link", "code"] as const;

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try { const u = new URL(value); return (u.protocol === "http:" || u.protocol === "https:") && u.href === value; } catch { return false; }
}
const markSchema: z.ZodTypeAny = z.object({
  type: z.enum(markTypes),
  attrs: z.record(z.string(), z.unknown()).optional(),
}).superRefine((mark, ctx) => {
  if (mark.type === "link" && !safeHttpUrl(mark.attrs?.href)) ctx.addIssue({ code: "custom", message: "Links must be absolute HTTP/HTTPS URLs." });
  if (mark.type !== "link" && mark.attrs && Object.keys(mark.attrs).length > 0) ctx.addIssue({ code: "custom", message: "Only link marks may include attrs." });
});
const nodeSchema: z.ZodTypeAny = z.lazy(() => z.object({
  type: z.enum(nodeTypes),
  text: z.string().max(REPORT_LIMITS.maxTextNodeChars).optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
  marks: z.array(markSchema).optional(),
  content: z.array(nodeSchema).optional(),
}).strict().superRefine((node, ctx) => {
  if (node.type === "heading" && ![1,2,3].includes(Number(node.attrs?.level))) ctx.addIssue({ code: "custom", message: "Headings support levels 1-3." });
  if (node.type !== "heading" && node.attrs && node.type !== "doc" && Object.keys(node.attrs).length > 0) ctx.addIssue({ code: "custom", message: "Unsupported node attributes." });
  if (node.type === "text" && typeof node.text !== "string") ctx.addIssue({ code: "custom", message: "Text nodes require text." });
  if (node.type !== "text" && node.text) ctx.addIssue({ code: "custom", message: "Only text nodes may include text." });
}));

function stats(value: unknown, depth = 0): { nodes: number; maxDepth: number; textChars: number } {
  if (!value || typeof value !== "object") return { nodes: 0, maxDepth: depth, textChars: 0 };
  const v = value as { text?: unknown; content?: unknown };
  let out = { nodes: 1, maxDepth: depth, textChars: typeof v.text === "string" ? v.text.length : 0 };
  if (Array.isArray(v.content)) for (const child of v.content) { const s = stats(child, depth + 1); out = { nodes: out.nodes + s.nodes, maxDepth: Math.max(out.maxDepth, s.maxDepth), textChars: out.textChars + s.textChars }; }
  return out;
}
export const tiptapDocSchema = nodeSchema.superRefine((v, ctx) => {
  const root = v as { type?: string; attrs?: Record<string, unknown> };
  if (root.type !== "doc") ctx.addIssue({ code: "custom", message: "Report content must be a TipTap doc." });
  if (root.attrs?.version !== 1 || Object.keys(root.attrs ?? {}).some((k) => k !== "version")) ctx.addIssue({ code: "custom", message: "Report document version must be exactly 1." });
  const encoded = JSON.stringify(v);
  const s = stats(v);
  if (Buffer.byteLength(encoded, "utf8") > REPORT_LIMITS.maxBytes) ctx.addIssue({ code: "custom", message: "Report content is too large." });
  if (s.nodes > REPORT_LIMITS.maxNodes) ctx.addIssue({ code: "custom", message: "Report content has too many nodes." });
  if (s.maxDepth > REPORT_LIMITS.maxDepth) ctx.addIssue({ code: "custom", message: "Report content is nested too deeply." });
  if (s.textChars > REPORT_LIMITS.maxTextChars) ctx.addIssue({ code: "custom", message: "Report text is too large." });
});
export const emptyTiptapDoc = { type: "doc", attrs: { version: 1 }, content: [{ type: "paragraph" }] };
export const reportSchema = z.object({ title: z.string().trim().min(1).max(200), type: z.enum(reportTypes), status: z.enum(reportStatuses), content: tiptapDocSchema.default(emptyTiptapDoc) });
export const reportMetaSchema = reportSchema.omit({ content: true });
export type ReportDoc = z.infer<typeof tiptapDocSchema>;
export function parseJsonDoc(value: unknown) { return tiptapDocSchema.safeParse(value); }
export function safeReportFilename(title: string, ext: string) { const base = title.normalize("NFKD").replace(/[^a-zA-Z0-9 _.-]/g, "").replace(/^\.+/, "").trim().replace(/\s+/g, "-").slice(0, 80) || "report"; return `${base}.${ext}`; }
export function formObject(fd: FormData) { return Object.fromEntries(fd.entries()); }
export function canonicalReportRevision(v: { title: unknown; type: unknown; status: unknown; content: unknown }) { return JSON.stringify({ title: v.title, type: v.type, status: v.status, content: v.content }); }
export function isSafeHttpUrl(value: unknown) { return safeHttpUrl(value); }
