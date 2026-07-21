import React from "react";
import { Link, Text, View, StyleSheet } from "@react-pdf/renderer";
type PdfStyle = Record<string, unknown>;
const PdfText = Text as unknown as React.ElementType;
const PdfView = View as unknown as React.ElementType;
const PdfLink = Link as unknown as React.ElementType;
import type { ReportDoc } from "./schema";
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
export const pdfStyles: Record<string, PdfStyle> = StyleSheet.create({
  h1: { fontSize: 22, marginBottom: 10, fontWeight: 700 },
  h2: { fontSize: 18, marginBottom: 8, fontWeight: 700 },
  h3: { fontSize: 15, marginBottom: 6, fontWeight: 700 },
  p: { marginBottom: 7 },
  bold: { fontWeight: 700 },
  italic: { fontStyle: "italic" },
  code: { fontFamily: "Courier", backgroundColor: "#f1f5f9" },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: "#38bdf8",
    paddingLeft: 8,
    marginBottom: 8,
    color: "#475569",
  },
  codeBlock: {
    fontFamily: "Courier",
    backgroundColor: "#f1f5f9",
    padding: 8,
    marginBottom: 8,
  },
  li: { flexDirection: "row", marginBottom: 4 },
  bullet: { width: 24 },
  liText: { flex: 1 },
  table: {
    display: "flex",
    width: "100%",
    marginBottom: 10,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#cbd5e1",
  },
  row: { flexDirection: "row" },
  cell: {
    flex: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
    padding: 4,
  },
  th: { fontWeight: 700, backgroundColor: "#f8fafc" },
  link: { color: "#0369a1", textDecoration: "underline" },
});
function pdfInline(ns?: TNode[], keyPrefix = "i"): React.ReactNode[] {
  return (ns ?? []).flatMap((n, i): React.ReactNode[] => {
    if (n.type === "hardBreak")
      return [React.createElement(Text, { key: `${keyPrefix}-${i}` }, "\n")];
    if (n.type !== "text") return [];
    const child: React.ReactNode = n.text ?? "";
    const style: PdfStyle[] = (n.marks ?? []).flatMap((m) =>
      m.type === "bold"
        ? [pdfStyles.bold]
        : m.type === "italic"
          ? [pdfStyles.italic]
          : m.type === "code"
            ? [pdfStyles.code]
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
            style: [...style, pdfStyles.link],
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
): React.ReactNode {
  switch (n.type) {
    case "paragraph":
      return React.createElement(
        PdfText,
        { key, style: pdfStyles.p },
        pdfInline(n.content, key),
      );
    case "heading":
      return React.createElement(
        PdfText,
        {
          key,
          style:
            Number(n.attrs?.level) === 1
              ? pdfStyles.h1
              : Number(n.attrs?.level) === 2
                ? pdfStyles.h2
                : pdfStyles.h3,
        },
        pdfInline(n.content, key),
      );
    case "bulletList":
      return React.createElement(
        PdfView,
        { key },
        children(n).map((c, i) =>
          pdfBlock(c, `${key}-${i}`, depth, false, i + 1),
        ),
      );
    case "orderedList": {
      const start = Number(n.attrs?.start) || 1;
      return React.createElement(
        PdfView,
        { key },
        children(n).map((c, i) =>
          pdfBlock(c, `${key}-${i}`, depth, true, start + i),
        ),
      );
    }
    case "listItem": {
      const [first, ...rest] = children(n);
      return React.createElement(
        PdfView,
        { key, style: [pdfStyles.li, { marginLeft: depth * 14 }] },
        React.createElement(
          PdfText,
          { style: pdfStyles.bullet },
          ordered ? `${index}.` : "•",
        ),
        React.createElement(
          PdfView,
          { style: pdfStyles.liText },
          first ? pdfBlock(first, `${key}-first`, depth) : null,
          rest.map((r, i) => pdfBlock(r, `${key}-r${i}`, depth + 1)),
        ),
      );
    }
    case "blockquote":
      return React.createElement(
        PdfView,
        { key, style: pdfStyles.quote },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth)),
      );
    case "codeBlock":
      return React.createElement(
        PdfText,
        { key, style: pdfStyles.codeBlock },
        children(n)
          .map((c) => c.text ?? "")
          .join(""),
      );
    case "table":
      return React.createElement(
        PdfView,
        { key, style: pdfStyles.table },
        children(n).map((r, i) => pdfBlock(r, `${key}-${i}`, depth)),
      );
    case "tableRow":
      return React.createElement(
        PdfView,
        { key, style: pdfStyles.row },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth)),
      );
    case "tableCell":
    case "tableHeader":
      return React.createElement(
        PdfView,
        {
          key,
          style: [pdfStyles.cell, n.type === "tableHeader" ? pdfStyles.th : {}],
        },
        children(n).map((c, i) => pdfBlock(c, `${key}-${i}`, depth)),
      );
    case "hardBreak":
      return React.createElement(PdfText, { key }, "\n");
    default:
      return null;
  }
}
export function tiptapToPdfElements(doc: ReportDoc) {
  return children(doc as TNode).map((n, i) => pdfBlock(n, `b-${i}`));
}
