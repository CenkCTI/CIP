import { z } from "zod";

export const reportTypes = [
  "TECHNICAL",
  "EXECUTIVE",
  "CTI",
  "AI_SECURITY",
  "OSINT",
] as const;
export const reportStatuses = ["DRAFT", "REVIEW", "FINAL"] as const;
export type ReportType = (typeof reportTypes)[number];
export type ReportStatus = (typeof reportStatuses)[number];

const markSchema: z.ZodTypeAny = z.object({
  type: z.enum(["bold", "italic", "link", "code"]),
  attrs: z.record(z.string(), z.unknown()).optional(),
});
const nodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    type: z.enum([
      "doc",
      "paragraph",
      "text",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "blockquote",
      "codeBlock",
      "hardBreak",
      "table",
      "tableRow",
      "tableCell",
      "tableHeader",
    ]),
    text: z.string().max(10000).optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    marks: z.array(markSchema).optional(),
    content: z.array(nodeSchema).optional(),
  }),
);
export const tiptapDocSchema = nodeSchema.refine(
  (v) => (v as { type?: string }).type === "doc",
  "Report content must be a TipTap doc.",
);
export const emptyTiptapDoc = {
  type: "doc",
  attrs: { version: 1 },
  content: [{ type: "paragraph" }],
};
export const reportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(reportTypes),
  status: z.enum(reportStatuses),
  content: tiptapDocSchema.default(emptyTiptapDoc),
});
export const reportMetaSchema = reportSchema.omit({ content: true });
export type ReportDoc = z.infer<typeof tiptapDocSchema>;
export function parseJsonDoc(value: unknown) {
  return tiptapDocSchema.safeParse(value);
}
export function safeReportFilename(title: string, ext: string) {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9 _.-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "report";
  return `${base}.${ext}`;
}
export function formObject(fd: FormData) {
  return Object.fromEntries(fd.entries());
}
