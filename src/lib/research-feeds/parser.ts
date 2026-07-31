/* eslint-disable @typescript-eslint/no-explicit-any */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { FeedError } from "./errors";
import { normalizeItemUrl } from "./url";
export type ResearchFeedType = "RSS" | "ATOM" | "JSON_FEED";
export type NormalizedResearchItem = {
  externalId: string | null;
  title: string | null;
  canonicalUrl: string | null;
  summaryText: string | null;
  contentText: string | null;
  authorName: string | null;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
  categories: string[];
  language: string | null;
};
const text = (v: unknown, max: number) => {
  if (v == null) return null;
  const s = String(
    typeof v === "object" ? ((v as Record<string, unknown>)["#text"] ?? "") : v,
  )
    .replace(
      /<(script|style|object|iframe|embed|svg)\b[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const c = Number(n);
      return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
};
const jsonString = (v: unknown, max: number) =>
  typeof v === "string" ? text(v, max) : null;
const date = (v: unknown) => {
  const s = jsonString(v, 100);
  if (!s) return null;
  const n = Date.parse(s);
  return Number.isNaN(n) ? null : new Date(n).toISOString();
};
const arr = <T>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function parseJsonFeed(
  source: string,
  baseUrl: string,
  maxItems: number,
): { type: "JSON_FEED"; items: NormalizedResearchItem[] } {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new FeedError("JSON_INVALID");
  }
  if (!record(value)) throw new FeedError("JSON_FEED_STRUCTURE");
  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.depth > 40) throw new FeedError("JSON_UNSAFE");
    if (++nodes > 100000) throw new FeedError("JSON_UNSAFE");
    if (Array.isArray(current.value))
      for (const child of current.value)
        stack.push({ value: child, depth: current.depth + 1 });
    else if (record(current.value))
      for (const [key, child] of Object.entries(current.value)) {
        if (!["__proto__", "prototype", "constructor"].includes(key))
          stack.push({ value: child, depth: current.depth + 1 });
      }
  }
  if (
    value.version !== "https://jsonfeed.org/version/1.1" &&
    value.version !== "https://jsonfeed.org/version/1"
  )
    throw new FeedError("JSON_FEED_VERSION");
  if (!jsonString(value.title, 500) || !Array.isArray(value.items))
    throw new FeedError("JSON_FEED_STRUCTURE");
  const feedLanguage = jsonString(value.language, 50),
    items: NormalizedResearchItem[] = [];
  for (const raw of value.items.slice(0, Math.min(500, maxItems))) {
    if (!record(raw)) continue;
    const externalId = jsonString(raw.id, 1000);
    if (!externalId) continue;
    const title = jsonString(raw.title, 500),
      summaryText = jsonString(raw.summary, 20000),
      contentText =
        jsonString(raw.content_text, 100000) ??
        jsonString(raw.content_html, 100000);
    if (!title && !summaryText && !contentText) continue;
    const authors = Array.isArray(raw.authors) ? raw.authors.slice(0, 20) : [],
      primary = authors.find(record),
      legacy = record(raw.author) ? raw.author : null,
      tags = Array.isArray(raw.tags) ? raw.tags : [];
    items.push({
      externalId,
      title,
      canonicalUrl: normalizeItemUrl(
        jsonString(raw.url, 4096) ?? jsonString(raw.external_url, 4096),
        baseUrl,
      ),
      summaryText,
      contentText,
      authorName:
        jsonString(primary?.name, 500) ?? jsonString(legacy?.name, 500),
      publishedAt: date(raw.date_published),
      sourceUpdatedAt: date(raw.date_modified),
      categories: [
        ...new Set(
          tags
            .slice(0, 50)
            .map((v) => jsonString(v, 100))
            .filter((v): v is string => !!v),
        ),
      ],
      language: jsonString(raw.language, 50) ?? feedLanguage,
    });
  }
  return { type: "JSON_FEED", items };
}
export function parseFeed(
  input: string,
  baseUrl: string,
  maxItems = 500,
): { type: ResearchFeedType; items: NormalizedResearchItem[] } {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input,
    start = source.trimStart();
  if (start.startsWith("{")) return parseJsonFeed(source, baseUrl, maxItems);
  if (!start.startsWith("<")) throw new FeedError("FEED_UNSUPPORTED");
  if (/<!DOCTYPE|<!ENTITY|<\s*xinclude\b/i.test(source))
    throw new FeedError("XML_UNSAFE");
  if (XMLValidator.validate(source) !== true)
    throw new FeedError("XML_INVALID");
  let ordered: unknown;
  try {
    ordered = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
    }).parse(source);
  } catch {
    throw new FeedError("XML_INVALID");
  }
  let nodes = 0;
  const walk = (value: unknown, depth: number) => {
    if (depth > 40) throw new FeedError("XML_UNSAFE");
    if (Array.isArray(value)) {
      for (const child of value) walk(child, depth);
      return;
    }
    if (value && typeof value === "object")
      for (const [key, child] of Object.entries(value)) {
        if (!key.startsWith(":")) {
          nodes++;
          if (nodes > 100000) throw new FeedError("XML_UNSAFE");
        }
        walk(child, depth + 1);
      }
  };
  walk(ordered, 0);
  let root: Record<string, any>;
  try {
    root = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      trimValues: true,
    }).parse(source);
  } catch {
    throw new FeedError("XML_INVALID");
  }
  let type: "RSS" | "ATOM", raw: any[];
  if (root.rss?.channel) {
    type = "RSS";
    raw = arr(root.rss.channel.item);
  } else if (root.feed) {
    type = "ATOM";
    raw = arr(root.feed.entry);
  } else throw new FeedError("FEED_UNSUPPORTED");
  const items = raw
    .slice(0, Math.min(500, maxItems))
    .map((x: any): NormalizedResearchItem => {
      const links = arr(x.link),
        link =
          type === "ATOM"
            ? (links.find((l: any) => l?.["@_rel"] === "alternate") ??
                links[0])?.["@_href"]
            : text(x.link, 4096);
      return {
        externalId: text(x.guid ?? x.id, 1000),
        title: text(x.title, 500),
        canonicalUrl: normalizeItemUrl(link ? String(link) : null, baseUrl),
        summaryText: text(x.description ?? x.summary, 20000),
        contentText: text(x["content:encoded"] ?? x.content, 100000),
        authorName: text(x.author?.name ?? x.author ?? x["dc:creator"], 500),
        publishedAt: date(x.pubDate ?? x.published),
        sourceUpdatedAt: date(x.updated),
        categories: [
          ...new Set(
            arr(x.category)
              .map((c) =>
                text(
                  typeof c === "object" ? ((c as any)["@_term"] ?? c) : c,
                  100,
                ),
              )
              .filter(Boolean) as string[],
          ),
        ].slice(0, 50),
        language: text(x.language ?? root.feed?.["@_xml:lang"], 50),
      };
    })
    .filter((i) => i.title || i.summaryText || i.contentText);
  return { type, items };
}
