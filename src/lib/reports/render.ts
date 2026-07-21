import type { ReportDoc } from "./schema";
const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const isSafeUrl = (href: unknown) => {
  try {
    const u = new URL(String(href));
    return ["http:", "https:"].includes(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
};
type N = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: N[];
};
function textHtml(n: N) {
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
function inline(ns?: N[]) {
  return (ns ?? [])
    .map((n) =>
      n.type === "text"
        ? textHtml(n)
        : n.type === "hardBreak"
          ? "<br>"
          : renderNode(n),
    )
    .join("");
}
function renderNode(n: N): string {
  switch (n.type) {
    case "paragraph":
      return `<p>${inline(n.content)}</p>`;
    case "heading": {
      const l = Math.min(3, Math.max(1, Number(n.attrs?.level) || 1));
      return `<h${l}>${inline(n.content)}</h${l}>`;
    }
    case "bulletList":
      return `<ul>${(n.content ?? []).map(renderNode).join("")}</ul>`;
    case "orderedList":
      return `<ol>${(n.content ?? []).map(renderNode).join("")}</ol>`;
    case "listItem":
      return `<li>${(n.content ?? []).map(renderNode).join("")}</li>`;
    case "blockquote":
      return `<blockquote>${(n.content ?? []).map(renderNode).join("")}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${escapeHtml((n.content ?? []).map((c) => c.text ?? "").join(""))}</code></pre>`;
    case "table":
      return `<table>${(n.content ?? []).map(renderNode).join("")}</table>`;
    case "tableRow":
      return `<tr>${(n.content ?? []).map(renderNode).join("")}</tr>`;
    case "tableCell":
      return `<td>${inline(n.content)}</td>`;
    case "tableHeader":
      return `<th>${inline(n.content)}</th>`;
    case "doc":
      return (n.content ?? []).map(renderNode).join("\n");
    default:
      return "";
  }
}
export function tiptapToHtml(doc: ReportDoc) {
  return renderNode(doc as N);
}
export function standaloneHtml(
  doc: ReportDoc,
  meta: { title: string; type: string; status: string; updated_at?: string },
) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title><style>body{font-family:Inter,Arial,sans-serif;line-height:1.55;max-width:900px;margin:40px auto;color:#111827}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:6px}pre{background:#f1f5f9;padding:12px;white-space:pre-wrap}blockquote{border-left:4px solid #38bdf8;margin-left:0;padding-left:16px;color:#475569}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(meta.title)}</h1><p><strong>Type:</strong> ${escapeHtml(meta.type)} · <strong>Status:</strong> ${escapeHtml(meta.status)}</p>${tiptapToHtml(doc)}</body></html>`;
}
function mdInline(ns?: N[]) {
  return (ns ?? [])
    .map((n) => {
      if (n.type !== "text") return n.type === "hardBreak" ? "  \n" : "";
      let t = n.text ?? "";
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        else if (m.type === "italic") t = `*${t}*`;
        else if (m.type === "code") t = `\`${t.replace(/`/g, "\\`")}\``;
        else if (m.type === "link") {
          const href = isSafeUrl(m.attrs?.href);
          if (href) t = `[${t}](${href})`;
        }
      }
      return t;
    })
    .join("");
}
function md(n: N, depth = 0): string {
  switch (n.type) {
    case "paragraph":
      return mdInline(n.content) + "\n\n";
    case "heading":
      return `${"#".repeat(Math.min(3, Math.max(1, Number(n.attrs?.level) || 1)))} ${mdInline(n.content)}\n\n`;
    case "bulletList":
      return (n.content ?? []).map((c) => md(c, depth)).join("") + "\n";
    case "orderedList":
      return (
        (n.content ?? [])
          .map((c, i) => `${i + 1}. ${mdInline(c.content?.[0]?.content)}\n`)
          .join("") + "\n"
      );
    case "listItem":
      return `- ${mdInline(n.content?.[0]?.content)}\n`;
    case "blockquote":
      return (
        (n.content ?? []).map((c) => "> " + md(c).trim()).join("\n") + "\n\n"
      );
    case "codeBlock":
      return (
        "```\n" +
        (n.content ?? []).map((c) => c.text ?? "").join("") +
        "\n```\n\n"
      );
    case "table":
      return (
        (n.content ?? [])
          .map(
            (r) =>
              "| " +
              (r.content ?? []).map((c) => mdInline(c.content)).join(" | ") +
              " |\n",
          )
          .join("") + "\n"
      );
    case "doc":
      return (n.content ?? []).map((c) => md(c, depth)).join("");
    default:
      return "";
  }
}
export function tiptapToMarkdown(doc: ReportDoc, title?: string) {
  return `${title ? `# ${title}\n\n` : ""}${md(doc as N).trim()}\n`;
}
export function plainText(doc: ReportDoc) {
  return tiptapToMarkdown(doc).replace(/[#*_`>|-]/g, "");
}
export { escapeHtml, isSafeUrl };
