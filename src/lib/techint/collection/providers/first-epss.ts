import "server-only";

import { z } from "zod";
import { CollectionError } from "../errors";
import { bounded, canonicalInstant, dateOnlyInstant, safeIssue } from "../mapping";
import { firstEpssCursorSchema } from "../schema";
import { fetchBoundedJson } from "../transport";
import type { AdapterCollectionResult, MappedTechnicalSignal, TechnicalSourceAdapter } from "../types";

export const FIRST_EPSS_URL = "https://api.first.org/data/v1/epss";
const RECORD_LIMIT = 2000;
const RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024;

const epssRecordSchema = z.object({
  cve: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
  epss: z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),
  percentile: z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).passthrough();

const epssResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().max(10000),
  data: z.array(z.unknown()).max(RECORD_LIMIT),
}).passthrough();

function decimal01(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error("INVALID_EPSS_DECIMAL");
  return parsed;
}

function datasetEffectiveAt(lastModified: string | undefined, scoreDate: string) {
  if (lastModified) {
    try { return canonicalInstant(lastModified); } catch { /* use score date */ }
  }
  return dateOnlyInstant(scoreDate);
}

export function mapFirstEpssRecord(raw: unknown, receivedAt: string, lastModified?: string): MappedTechnicalSignal {
  const item = epssRecordSchema.parse(raw);
  const epss = decimal01(item.epss);
  const percentile = decimal01(item.percentile);
  const scoreDate = dateOnlyInstant(item.date);
  const effectiveAt = datasetEffectiveAt(lastModified, item.date);
  const facts = { cve: item.cve, epss, percentile, scoreDate: item.date };
  const title = `FIRST EPSS score for ${item.cve}`;
  return {
    signal: {
      // EPSS is provider-specific scoring context, not the canonical NVD CVE snapshot.
      // A source-defined PROVIDER_ALERT avoids colliding with NVD's VULNERABILITY_CHANGE key.
      signalType: "PROVIDER_ALERT",
      canonicalKey: `report:first-epss:${item.cve}`,
      title,
      summary: bounded(`${item.cve} has EPSS ${item.epss} and percentile ${item.percentile} for ${item.date}.`, 4000),
      lifecycle: "ACTIVE",
      severity: "UNKNOWN",
      confidence: null,
      facts,
      publishedAt: scoreDate,
      observedAt: scoreDate,
      effectiveAt,
    },
    observation: {
      sourceFamily: "VULNERABILITY",
      sourceSystem: "first-epss",
      sourceRecordKey: item.cve,
      sourceRevisionKey: `${item.date}:${item.epss}:${item.percentile}`,
      sourceUrl: FIRST_EPSS_URL,
      sourceTitle: title,
      sourcePublishedAt: scoreDate,
      sourceModifiedAt: effectiveAt,
      sourceObservedAt: scoreDate,
      receivedAt,
      effectiveAt,
      sourceSnapshot: facts,
    },
    entityAssertions: [
      { entityKind: "CVE", displayValue: item.cve, normalizedValue: item.cve, semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
    ],
  };
}

export function mapFirstEpssResponse(payload: unknown, receivedAt: string, lastModified?: string): AdapterCollectionResult {
  const page = epssResponseSchema.parse(payload);
  if (page.offset !== 0 || page.data.length > RECORD_LIMIT) {
    throw new CollectionError("INVALID_SOURCE_RESPONSE", "FIRST EPSS returned an unexpected bounded result page.");
  }
  const signals: MappedTechnicalSignal[] = [];
  const issues = [];
  for (const raw of page.data) {
    try { signals.push(mapFirstEpssRecord(raw, receivedAt, lastModified)); }
    catch {
      const cve = raw && typeof raw === "object" && "cve" in raw ? String((raw as { cve?: unknown }).cve ?? "") : null;
      issues.push(safeIssue("INVALID_EPSS_RECORD", "A malformed FIRST EPSS record was skipped.", cve));
    }
  }
  return {
    recordsSeen: page.data.length,
    recordsMapped: signals.length,
    signals,
    issues: issues.slice(0, 100),
    nextCursor: { version: 1, ...(lastModified ? { lastModified } : {}) },
  };
}

export const firstEpssAdapter: TechnicalSourceAdapter = {
  metadata: {
    key: "FIRST_EPSS",
    displayName: "FIRST EPSS",
    description: "Official FIRST Exploit Prediction Scoring System data recorded as source-backed provider scoring context.",
    sourceFamily: "VULNERABILITY",
    defaultIntervalMinutes: 360,
    minimumIntervalMinutes: 60,
    maximumIntervalMinutes: 1440,
    manual: true,
    scheduled: true,
    credentialRequirement: "NONE",
    fixedHosts: ["api.first.org"],
    settingsFields: [{ name: "minimumEpss", label: "Minimum EPSS", type: "number", minimum: 0, maximum: 1, step: 0.01, defaultValue: 0.1 }],
  },
  async collect(context) {
    const cursor = firstEpssCursorSchema.parse(context.cursor);
    const settings = z.object({ minimumEpss: z.number().min(0).max(1).optional().default(0.1) }).strict().parse(context.settings);
    const url = new URL(FIRST_EPSS_URL);
    url.searchParams.set("epss-gt", String(settings.minimumEpss));
    url.searchParams.set("sort", "-epss");
    url.searchParams.set("limit", String(RECORD_LIMIT));
    url.searchParams.set("offset", "0");
    const response = await fetchBoundedJson({
      url,
      allowedHost: "api.first.org",
      allowedPath: "/data/v1/epss",
      maxBytes: RESPONSE_LIMIT_BYTES,
      headers: cursor.lastModified ? { "if-modified-since": cursor.lastModified } : undefined,
      fetchImpl: context.fetchImpl,
    });
    if (response.status === 304) {
      return { recordsSeen: 0, recordsMapped: 0, signals: [], issues: [], nextCursor: cursor };
    }
    return mapFirstEpssResponse(response.json, context.now.toISOString(), response.lastModified);
  },
};
