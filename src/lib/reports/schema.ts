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

export const REPORT_LIMITS = {
  maxBytes: 250_000,
  maxNodes: 2_000,
  maxDepth: 30,
  maxTextChars: 120_000,
  maxTextNodeChars: 10_000,
  maxChildrenPerNode: 500,
} as const;
const nodeTypes = [
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
] as const;
const markTypes = ["bold", "italic", "link", "code"] as const;

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;
  if (value !== value.trim()) return false;
  try {
    const u = new URL(value);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
type Preflight = { ok: true } | { ok: false; message: string };
export function preflightReportDoc(value: unknown): Preflight {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    return { ok: false, message: "Report content must be JSON serializable." };
  }
  if (byteLength(encoded) > REPORT_LIMITS.maxBytes)
    return { ok: false, message: "Report content is too large." };
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let nodes = 0;
  let textChars = 0;
  while (stack.length) {
    const item = stack.pop()!;
    if (item.depth > REPORT_LIMITS.maxDepth)
      return { ok: false, message: "Report content is nested too deeply." };
    if (!item.value || typeof item.value !== "object") continue;
    nodes += 1;
    if (nodes > REPORT_LIMITS.maxNodes)
      return { ok: false, message: "Report content has too many nodes." };
    const node = item.value as { text?: unknown; content?: unknown };
    if (typeof node.text === "string") {
      textChars += node.text.length;
      if (
        node.text.length > REPORT_LIMITS.maxTextNodeChars ||
        textChars > REPORT_LIMITS.maxTextChars
      )
        return { ok: false, message: "Report text is too large." };
    }
    if (Array.isArray(node.content)) {
      if (node.content.length > REPORT_LIMITS.maxChildrenPerNode)
        return {
          ok: false,
          message: "Report content has too many child nodes.",
        };
      for (let i = node.content.length - 1; i >= 0; i--)
        stack.push({ value: node.content[i], depth: item.depth + 1 });
    }
  }
  return { ok: true };
}
const tableAttrsSchema = z
  .object({
    colspan: z.literal(1),
    rowspan: z.literal(1),
    colwidth: z.union([
      z.null(),
      z.array(z.number().int().min(20).max(2000)).max(20),
    ]),
    align: z
      .union([z.null(), z.enum(["left", "center", "right"])])
      .optional()
      .default(null),
  })
  .strict();
const markSchema: z.ZodTypeAny = z
  .object({
    type: z.enum(markTypes),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((mark, ctx) => {
    if (mark.type === "link") {
      const attrs = z
        .object({ href: z.string() })
        .strict()
        .safeParse(mark.attrs ?? {});
      if (!attrs.success || !safeHttpUrl(attrs.data.href))
        ctx.addIssue({
          code: "custom",
          message:
            "Links must be absolute HTTP/HTTPS URLs without credentials.",
        });
    } else if (mark.attrs && Object.keys(mark.attrs).length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Only link marks may include attrs.",
      });
    }
  });
const nodeSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      type: z.enum(nodeTypes),
      text: z.string().max(REPORT_LIMITS.maxTextNodeChars).optional(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      marks: z.array(markSchema).optional(),
      content: z.array(nodeSchema).optional(),
    })
    .strict()
    .superRefine((node, ctx) => {
      const attrs = node.attrs ?? {};
      if (node.type === "doc") {
        const ok = z
          .object({ version: z.literal(1) })
          .strict()
          .safeParse(attrs).success;
        if (!ok)
          ctx.addIssue({
            code: "custom",
            message: "Report document version must be exactly 1.",
          });
      } else if (node.type === "heading") {
        const ok = z
          .object({
            level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          })
          .strict()
          .safeParse(attrs).success;
        if (!ok)
          ctx.addIssue({
            code: "custom",
            message: "Headings support levels 1-3.",
          });
      } else if (node.type === "orderedList") {
        const ok = z
          .object({
            start: z.number().int().min(1).max(10000).default(1),
            type: z
              .union([z.null(), z.enum(["1", "a", "A", "i", "I"])])
              .default(null),
          })
          .strict()
          .safeParse(attrs).success;
        if (!ok)
          ctx.addIssue({
            code: "custom",
            message:
              "Ordered lists support bounded start values and safe numbering types.",
          });
      } else if (node.type === "tableCell" || node.type === "tableHeader") {
        const parsed = tableAttrsSchema.safeParse(attrs);
        if (!parsed.success)
          ctx.addIssue({
            code: "custom",
            message:
              "Tables support only normal cells with colspan/rowspan of 1 and safe alignment.",
          });
      } else if (Object.keys(attrs).length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "Unsupported node attributes.",
        });
      }
      if (node.type === "text" && typeof node.text !== "string")
        ctx.addIssue({ code: "custom", message: "Text nodes require text." });
      if (node.type !== "text" && node.text)
        ctx.addIssue({
          code: "custom",
          message: "Only text nodes may include text.",
        });
    }),
);
export const tiptapDocSchema = z.preprocess(
  (value, ctx) => {
    const preflight = preflightReportDoc(value);
    if (!preflight.ok) {
      ctx.addIssue({ code: "custom", message: preflight.message });
      return z.NEVER;
    }
    return value;
  },
  nodeSchema.superRefine((v, ctx) => {
    if ((v as { type?: string }).type !== "doc")
      ctx.addIssue({
        code: "custom",
        message: "Report content must be a TipTap doc.",
      });
  }),
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
      .replace(/^\.+/, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "report";
  return `${base}.${ext}`;
}
export function formObject(fd: FormData) {
  return Object.fromEntries(fd.entries());
}
export function canonicalReportRevision(v: {
  title: unknown;
  type: unknown;
  status: unknown;
  content: unknown;
}) {
  return JSON.stringify({
    title: v.title,
    type: v.type,
    status: v.status,
    content: v.content,
  });
}
export function isSafeHttpUrl(value: unknown) {
  return safeHttpUrl(value);
}
