import React from "react";
import { Link, Text, View, StyleSheet } from "@react-pdf/renderer";
type PdfStyle = Record<string, unknown>;
const PdfText = Text as unknown as React.ElementType;
const PdfView = View as unknown as React.ElementType;
const PdfLink = Link as unknown as React.ElementType;
import type { ReportDoc } from "./schema";
import { DARK_REPORT_PDF_PALETTES, type ReportPdfAppearance } from "./pdf-appearance";
import { isSafeHttpUrl } from "./schema";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const isSafeUrl = (href: unknown) =>
  isSafeHttpUrl(href) ? String(href) : null;
type Mark = { type: string; attrs?: Record<string, unknown> };
export type TNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: TNode[];
};
const children = (n?: TNode) => n?.content ?? [];
function textHtml(n: TNode) {
  let out = escapeHtml(n.text ?? "");
  for (const m of n.marks ?? []) {
    if (m.type === "bold") out = `<strong>${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "code") out = `<code>${out}</code>`;
    else if (m.type === "link") {
      const href = isSafeUrl(m.attrs?.href);
      if (href)
        out = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${out}</a>`;
    }
  }
  return out;
}
function inlineHtml(ns?: TNode[]) {
  return (ns ?? [])
    .map((n) =>
      n.type === "text"
        ? textHtml(n)
        : n.type === "hardBreak"
          ? "<br>"
          : renderNodeHtml(n),
    )
    .join("");
}
function cellInline(n: TNode) {
  return children(n)
    .map((c) =>
      c.type === "paragraph" ? inlineHtml(c.content) : renderNodeHtml(c),
    )
    .join("");
}
function renderNodeHtml(n: TNode): string {
  switch (n.type) {
    case "paragraph":
      return `<p>${inlineHtml(n.content)}</p>`;
    case "heading": {
      const l = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1));
      return `<h${l}>${inlineHtml(n.content)}</h${l}>`;
    }
    case "bulletList":
      return `<ul>${children(n).map(renderNodeHtml).join("")}</ul>`;
    case "orderedList": {
      const start =
        Number(n.attrs?.start) > 1 ? ` start="${Number(n.attrs?.start)}"` : "";
      return `<ol${start}>${children(n).map(renderNodeHtml).join("")}</ol>`;
    }
    case "listItem":
      return `<li>${children(n).map(renderNodeHtml).join("")}</li>`;
    case "blockquote":
      return `<blockquote>${children(n).map(renderNodeHtml).join("")}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml(
        children(n)
          .map((c) => c.text ?? "")
          .join(""),
      )}</code></pre>`;
    case "table":
      return `<table><tbody>${children(n).map(renderNodeHtml).join("")}</tbody></table>`;
    case "tableRow":
      return `<tr>${children(n).map(renderNodeHtml).join("")}</tr>`;
    case "tableCell":
      return `<td>${cellInline(n)}</td>`;
    case "tableHeader":
      return `<th>${cellInline(n)}</th>`;
    case "doc":
      return children(n).map(renderNodeHtml).join("\n");
    default:
      return "";
  }
}
export function tiptapToHtml(doc: ReportDoc) {
  return renderNodeHtml(doc as TNode);
}
export function standaloneHtml(
  doc: ReportDoc,
  meta: { title: string; type: string; status: string; updated_at?: string },
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title><style>body{font-family:Inter,Arial,sans-serif;line-height:1.55;max-width:900px;margin:40px auto;color:#111827}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px;vertical-align:top}pre,code{background:#f1f5f9}pre{padding:12px;white-space:pre-wrap;overflow-wrap:anywhere}blockquote{border-left:4px solid #38bdf8;margin-left:0;padding-left:16px;color:#475569}a{color:#0369a1}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(meta.title)}</h1><p><strong>Type:</strong> ${escapeHtml(meta.type)} · <strong>Status:</strong> ${escapeHtml(meta.status)}</p>${tiptapToHtml(doc)}</body></html>`;
}
const mdEsc = (s: string) => s.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
function inlineMd(ns?: TNode[]) {
  return (ns ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type !== "text") return "";
      let t = mdEsc(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "code") t = `\`${(n.text ?? "").replace(/`/g, "\\`")}\``;
        else if (m.type === "bold") t = `**${t}**`;
        else if (m.type === "italic") t = `*${t}*`;
        else if (m.type === "link") {
          const href = isSafeUrl(m.attrs?.href);
          if (href) t = `[${t}](${href})`;
        }
      }
      return t;
    })
    .join("");
}
function blockMd(n: TNode, depth = 0, ordered = false, index = 1): string {
  switch (n.type) {
    case "paragraph":
      return inlineMd(n.content);
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, Number(n.attrs?.level) || 1)))} ${inlineMd(n.content)}\n\n`;
    case "bulletList":
      return (
        children(n)
          .map((c) => blockMd(c, depth, false))
          .join("") + "\n"
      );
    case "orderedList": {
      const start = Number(n.attrs?.start) || 1;
      return (
        children(n)
          .map((c, i) => blockMd(c, depth, true, start + i))
          .join("") + "\n"
      );
    }
    case "listItem": {
      const [first, ...rest] = children(n);
      const prefix = ordered ? `${index}. ` : "- ";
      return `${"  ".repeat(depth)}${prefix}${first ? blockMd(first, depth).trim() : ""}\n${rest.map((r) => blockMd(r, depth + 1)).join("")}`;
    }
    case "blockquote":
      return (
        children(n)
          .map((c) =>
            blockMd(c, depth)
              .trim()
              .split("\n")
              .map((l) => `> ${l}`)
              .join("\n"),
          )
          .join("\n") + "\n\n"
      );
    case "codeBlock":
      return (
        "```\n" +
        children(n)
          .map((c) => c.text ?? "")
          .join("") +
        "\n```\n\n"
      );
    case "table": {
      const rows = children(n);
      const rendered = rows.map(
        (r) =>
          `| ${children(r)
            .map((c) =>
              inlineMd(
                children(c).flatMap((x) =>
                  x.type === "paragraph" ? children(x) : [x],
                ),
              ),
            )
            .join(" | ")} |`,
      );
      if (rendered.length > 0)
        rendered.splice(
          1,
          0,
          `| ${children(rows[0])
            .map(() => "---")
            .join(" | ")} |`,
        );
      return rendered.join("\n") + "\n\n";
    }
    case "doc":
      return children(n)
        .map((c) => blockMd(c, depth))
        .join("");
    default:
      return "";
  }
}
export function tiptapToMarkdown(doc: ReportDoc, title?: string) {
  return `${title ? `# ${mdEsc(title)}\n\n` : ""}${blockMd(doc as TNode).trim()}\n`;
}
export function plainText(doc: ReportDoc) {
  return tiptapToMarkdown(doc).replace(/[#*_`>|-]/g, "");
}
// Print-safe equivalents of CİTEM's charcoal / bronze / amber UI palette.
// Warm ivory paper keeps long intelligence assessments legible when printed.
export const REPORT_PDF_COLORS = {
  charcoal: "#14191D",
  charcoalSoft: "#222B30",
  amber: "#B9822F",
  amberDark: "#80581E",
  amberLight: "#D4A958",
  ink: "#253038",
  secondary: "#58636B",
  rule: "#D9D2C5",
  paper: "#FCFBF8",
  panel: "#F2EFE9",
  white: "#FFFFFF",
} as const;

export type ReportPdfColors = Record<keyof typeof REPORT_PDF_COLORS,string>;
export function reportPdfColors(appearance:ReportPdfAppearance="original"):ReportPdfColors {
  return appearance==="original" ? REPORT_PDF_COLORS : DARK_REPORT_PDF_PALETTES[appearance];
}
function createPdfStyles(colors:ReportPdfColors):Record<string,PdfStyle> {
  const REPORT_PDF_COLORS=colors;
  // Original headings retain the current charcoal; dark output needs light ink.
  const headingInk=colors.paper==="#FCFBF8"?colors.charcoal:colors.ink;
  return StyleSheet.create({
  h1: {
    color: headingInk, fontSize: 19, lineHeight: 1.3,
    marginTop: 20, marginBottom: 11, paddingBottom: 8,
    borderBottomWidth: 2, borderBottomColor: REPORT_PDF_COLORS.amber,
    fontWeight: 700,
  },
  h2: {
    color: headingInk, fontSize: 14, lineHeight: 1.32,
    marginTop: 16, marginBottom: 9, fontWeight: 700,
    borderLeftWidth: 3, borderLeftColor: REPORT_PDF_COLORS.amber,
    paddingLeft: 10,
  },
  h3: {
    color: REPORT_PDF_COLORS.ink, fontSize: 11.5, lineHeight: 1.35,
    marginTop: 12, marginBottom: 6, fontWeight: 700,
  },
  p: { marginBottom: 9, color: REPORT_PDF_COLORS.ink, fontSize: 10.2, lineHeight: 1.52 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  code: { backgroundColor: REPORT_PDF_COLORS.panel, color: REPORT_PDF_COLORS.ink },
  quote: {
    backgroundColor: REPORT_PDF_COLORS.panel,
    borderLeftWidth: 3, borderLeftColor: REPORT_PDF_COLORS.amber,
    paddingHorizontal: 12, paddingVertical: 9, marginVertical: 8,
    color: REPORT_PDF_COLORS.secondary,
  },
  codeBlock: {
    backgroundColor: REPORT_PDF_COLORS.panel,
    borderLeftWidth: 2, borderLeftColor: REPORT_PDF_COLORS.rule,
    color: REPORT_PDF_COLORS.ink, fontSize: 9,
    padding: 10, marginVertical: 8, lineHeight: 1.45,
  },
  list: { marginBottom: 9 },
  li: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 22, fontSize: 9.5, color: REPORT_PDF_COLORS.amberDark },
  liText: { flex: 1 },
  table: {
    width: "100%", marginVertical: 12,
    borderTopWidth: 1, borderLeftWidth: 1, borderColor: REPORT_PDF_COLORS.rule,
  },
  row: { flexDirection: "row" },
  cell: {
    flex: 1, minWidth: 0, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: REPORT_PDF_COLORS.rule, paddingHorizontal: 8, paddingVertical: 7,
    backgroundColor: REPORT_PDF_COLORS.white,
  },
  th: { fontWeight: 700, backgroundColor: REPORT_PDF_COLORS.panel },
  link: { color: REPORT_PDF_COLORS.amberDark, textDecoration: "underline" },
  });
}
export const pdfStyles:Record<string,PdfStyle>=createPdfStyles(REPORT_PDF_COLORS);
function pdfInline(ns?: TNode[], keyPrefix = "i", styles:Record<string,PdfStyle>=pdfStyles): React.ReactNode[] {
  return (ns ?? []).flatMap((n, i): React.ReactNode[] => {
    if (n.type === "hardBreak")
      return [React.createElement(Text, { key: `${keyPrefix}-${i}` }, "\n")];
    if (n.type !== "text") return [];
    const child: React.ReactNode = n.text ?? "";
    const style: PdfStyle[] = (n.marks ?? []).flatMap((m) =>
      m.type === "bold"
        ? [styles.bold]
        : m.type === "italic"
          ? [styles.italic]
          : m.type === "code"
            ? [styles.code]
            : [],
    );
    const link = (n.marks ?? []).find((m) => m.type === "link");
    const href = isSafeUrl(link?.attrs?.href);
    if (href)
      return [
        React.createElement(
          PdfLink,
          {
            key: `${keyPrefix}-${i}`,
            src: href,
            style: [...style, styles.link],
          },
          child,
        ),
      ];
    return [
      React.createElement(PdfText, { key: `${keyPrefix}-${i}`, style }, child),
    ];
  });
}
function pdfBlock(
  n: TNode,
  key: string,
  depth = 0,
  ordered = false,
  index = 1,
  styles:Record<string,PdfStyle>=pdfStyles,
): React.ReactNode {
  switch (n.type) {
    case "paragraph":
      return React.createElement(
        PdfText,
        { key, style: styles.p },
        pdfInline(n.content, key, styles),
      );
    case "heading":
      return React.createElement(
        PdfText,
        {
          key,
          minPresenceAhead: 52,
          style:
            Number(n.attrs?.level) === 1
              ? styles.h1
              : Number(n.attrs?.level) === 2
                ? styles.h2
                : styles.h3,
        },
        pdfInline(n.content, key, styles),
      );
    case "bulletList":
      return React.createElement(
        PdfView,
        { key, style: styles.list },
        children(n).map((c, i) =>
          pdfBlock(c, `${key}-${i}`, depth, false, i + 1, styles),
        ),
      );
    case "orderedList": {
      const start = Number(n.attrs?.start) || 1;
      return React.createElement(
        PdfView,
        { key, style: styles.list },
        children(n).map((c, i) =>
          pdfBlock(c, `${key}-${i}`, depth, true, start + i, styles),
        ),
      );
    }
    case "listItem": {
      const [first, ...rest] = children(n);
      return React.createElement(
        PdfView,
        { key, style: [styles.li, { marginLeft: depth * 13 }] },
        React.createElement(
          PdfText,
          { style: styles.bullet },
          ordered ? `${index}.` : "•",
        ),
        React.createElement(
          PdfView,
          { style: styles.liText },
          first ? pdfBlock(first, `${key}-first`, depth, false, 1, styles) : null,
          rest.map((r, i) => pdfBlock(r, `${key}-r${i}`, depth + 1, false, 1, styles)),
        ),
      );
    }
    case "blockquote":
      return React.createElement(
        PdfView,
        { key, style: styles.quote },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth, false, 1, styles)),
      );
    case "codeBlock":
      return React.createElement(
        PdfText,
        { key, style: styles.codeBlock },
        children(n)
          .map((c) => c.text ?? "")
          .join(""),
      );
    case "table":
      return React.createElement(
        PdfView,
        { key, style: styles.table, wrap: true },
        children(n).map((r, i) => pdfBlock(r, `${key}-${i}`, depth)),
      );
    case "tableRow":
      return React.createElement(
        PdfView,
        { key, style: styles.row },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth, false, 1, styles)),
      );
    case "tableCell":
    case "tableHeader":
      return React.createElement(
        PdfView,
        {
          key,
          style: [styles.cell, n.type === "tableHeader" ? styles.th : {}],
        },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth, false, 1, styles)),
      );
    case "hardBreak":
      return React.createElement(PdfText, { key }, "\n");
    default:
      return null;
  }
}
export function tiptapToPdfElements(doc: ReportDoc, appearance:ReportPdfAppearance="original") {
  const styles=appearance==="original"?pdfStyles:createPdfStyles(reportPdfColors(appearance));
  return children(doc as TNode).map((n,i)=>pdfBlock(n,`b-${i}`,0,false,1,styles));
}
