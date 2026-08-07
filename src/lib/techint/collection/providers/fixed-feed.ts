import "server-only";

import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { bounded, canonicalInstant, safeIssue } from "../mapping";
import type { AdapterCollectionResult, MappedTechnicalSignal } from "../types";

export type FixedFeedItem = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  publishedAt: string;
  modifiedAt: string | null;
};

function array<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stableRecordKey(value: string) {
  const normalized = value.trim();
  if (normalized.length <= 180 && !/[\u0000-\u001f]/.test(normalized)) return normalized;
  return `sha256-${createHash("sha256").update(normalized).digest("hex")}`;
}

function safeHttpUrl(value: string | null | undefined, fallback: string | null = null): string | null {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || value.length > 2048) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text((value as { "#text"?: unknown })["#text"]);
  return "";
}

export function parseFixedXmlFeed(xml: string): FixedFeedItem[] {
  if (Buffer.byteLength(xml) > 4 * 1024 * 1024) throw new Error("HTTP_BODY_TOO_LARGE");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("INVALID_SOURCE_RESPONSE");
  const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, trimValues: true });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const items: FixedFeedItem[] = [];
  const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
  for (const raw of array(rss?.channel?.item as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const id = text(raw.guid) || text(raw.link);
    const published = text(raw.pubDate);
    if (!id || !published) continue;
    try {
      items.push({
        id,
        title: bounded(text(raw.title), 500),
        summary: bounded(text(raw.description), 4000),
        url: safeHttpUrl(text(raw.link)),
        publishedAt: canonicalInstant(published),
        modifiedAt: null,
      });
    } catch {
      continue;
    }
  }
  const feed = parsed.feed as { entry?: unknown } | undefined;
  for (const raw of array(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const links = array(raw.link as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const href = links.map((link) => text(link["@_href"])).find(Boolean) ?? "";
    const id = text(raw.id) || href;
    const published = text(raw.published) || text(raw.updated);
    if (!id || !published) continue;
    try {
      items.push({
        id,
        title: bounded(text(raw.title), 500),
        summary: bounded(text(raw.summary) || text(raw.content), 4000),
        url: safeHttpUrl(href),
        publishedAt: canonicalInstant(published),
        modifiedAt: text(raw.updated) ? canonicalInstant(text(raw.updated)) : null,
      });
    } catch {
      continue;
    }
  }
  return items.slice(0, 500);
}

const jsonFeedSchema = z.object({
  version: z.string().min(1).max(500),
  items: z.array(z.object({
    id: z.string().min(1).max(4000),
    url: z.string().max(4000).optional(),
    title: z.string().max(5000).optional(),
    content_text: z.string().max(20000).optional(),
    summary: z.string().max(20000).optional(),
    date_published: z.string().optional(),
    date_modified: z.string().optional(),
  }).passthrough()).max(500),
}).passthrough();

export function parseFixedJsonFeed(payload: unknown): FixedFeedItem[] {
  const feed = jsonFeedSchema.parse(payload);
  const items: FixedFeedItem[] = [];
  for (const item of feed.items) {
    const timestamp = item.date_modified ?? item.date_published;
    if (!timestamp) continue;
    try {
      items.push({
        id: item.id,
        title: bounded(item.title, 500),
        summary: bounded(item.summary ?? item.content_text, 4000),
        url: safeHttpUrl(item.url),
        publishedAt: canonicalInstant(item.date_published ?? timestamp),
        modifiedAt: item.date_modified ? canonicalInstant(item.date_modified) : null,
      });
    } catch {
      continue;
    }
  }
  return items;
}

function cveAssertions(item: FixedFeedItem) {
  const matches = `${item.title} ${item.summary}`.match(/\bCVE-\d{4}-\d{4,}\b/g) ?? [];
  return [...new Set(matches)].slice(0, 20).map((cve) => ({
    entityKind: "CVE" as const,
    displayValue: cve,
    normalizedValue: cve,
    semanticRole: "MENTIONS" as const,
    assertionBasis: "SYSTEM_EXTRACTED" as const,
    confidence: null,
  }));
}

export function mapFixedFeedItems(sourceSystem: string, sourceUrl: string, items: FixedFeedItem[], receivedAt: string): AdapterCollectionResult {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(sourceSystem)) throw new Error("INVALID_SOURCE_SYSTEM");
  const fixedSourceUrl = safeHttpUrl(sourceUrl);
  if (!fixedSourceUrl) throw new Error("INVALID_SOURCE_URL");
  const signals: MappedTechnicalSignal[] = [];
  const issues = [];
  for (const item of items) {
    try {
      const recordKey = stableRecordKey(item.id || item.url || "");
      if (!recordKey) throw new Error("missing identity");
      const effectiveAt = item.modifiedAt ?? item.publishedAt;
      const itemUrl = safeHttpUrl(item.url);
      const snapshot = { title: item.title, summary: item.summary, url: itemUrl, publishedAt: item.publishedAt, modifiedAt: item.modifiedAt };
      signals.push({
        signal: {
          signalType: "TECHNICAL_ADVISORY",
          canonicalKey: `advisory:${sourceSystem}:${recordKey}`,
          title: item.title || "Technical advisory",
          summary: item.summary,
          lifecycle: "ACTIVE",
          severity: "UNKNOWN",
          confidence: null,
          facts: snapshot,
          publishedAt: item.publishedAt,
          observedAt: effectiveAt,
          effectiveAt,
        },
        observation: {
          sourceFamily: "ADVISORY",
          sourceSystem,
          sourceRecordKey: recordKey,
          sourceRevisionKey: effectiveAt,
          sourceUrl: itemUrl ?? fixedSourceUrl,
          sourceTitle: item.title || null,
          sourcePublishedAt: item.publishedAt,
          sourceModifiedAt: item.modifiedAt,
          sourceObservedAt: effectiveAt,
          receivedAt,
          effectiveAt,
          sourceSnapshot: snapshot,
        },
        entityAssertions: cveAssertions(item),
      });
    } catch {
      issues.push(safeIssue("INVALID_FEED_ITEM", "A fixed advisory feed item was skipped.", item.id));
    }
  }
  const last = signals.map((signal) => signal.signal.effectiveAt).sort().at(-1);
  return {
    recordsSeen: items.length,
    recordsMapped: signals.length,
    signals,
    issues: issues.slice(0, 100),
    nextCursor: { version: 1, ...(last ? { lastItemWatermark: last } : {}) },
  };
}
