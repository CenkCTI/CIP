import "server-only";

import { z } from "zod";
import { nvdCursorSchema } from "../schema";
import { bounded, canonicalInstant, safeIssue } from "../mapping";
import { CollectionError } from "../errors";
import { fetchBoundedJson } from "../transport";
import type { AdapterCollectionResult, MappedTechnicalSignal, TechnicalSourceAdapter } from "../types";

export const NVD_CVE_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const INITIAL_PAGE_SIZE = 250;
const MIN_PAGE_SIZE = 125;
const PAGE_LIMIT = 20;
const REQUEST_LIMIT = 20;
const RECORD_LIMIT = 2000;
const REQUEST_DELAY_MS = 6500;
const REQUEST_TIMEOUT_MS = 30000;
const RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const OVERLAP_MS = 5 * 60 * 1000;
const MAX_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

const descriptionSchema = z.object({ lang: z.string().max(20), value: z.string().max(20000) }).passthrough();
const referenceSchema = z.object({ url: z.string().max(4000), source: z.string().max(500).optional(), tags: z.array(z.string().max(100)).max(20).optional() }).passthrough();
const weaknessSchema = z.object({ descriptions: z.array(descriptionSchema).max(50).optional().default([]) }).passthrough();
const cpeMatchSchema = z.object({ vulnerable: z.boolean().optional(), criteria: z.string().max(2000).optional(), matchCriteriaId: z.string().max(200).optional() }).passthrough();
const nodeSchema = z.object({ cpeMatch: z.array(cpeMatchSchema).max(200).optional().default([]) }).passthrough();
const configurationSchema = z.object({ nodes: z.array(nodeSchema).max(100).optional().default([]) }).passthrough();
const cvssDataSchema = z.object({ version: z.string().max(20).optional(), vectorString: z.string().max(1000).optional(), baseScore: z.number().min(0).max(10).optional(), baseSeverity: z.string().max(50).optional() }).passthrough();
const cvssMetricSchema = z.object({ source: z.string().max(500).optional(), type: z.string().max(100).optional(), cvssData: cvssDataSchema }).passthrough();
const metricsSchema = z.object({
  cvssMetricV40: z.array(cvssMetricSchema).max(20).optional(),
  cvssMetricV31: z.array(cvssMetricSchema).max(20).optional(),
  cvssMetricV30: z.array(cvssMetricSchema).max(20).optional(),
}).passthrough();
const cveSchema = z.object({
  id: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
  sourceIdentifier: z.string().max(500),
  published: z.string(),
  lastModified: z.string(),
  vulnStatus: z.string().max(100),
  descriptions: z.array(descriptionSchema).max(100).optional().default([]),
  metrics: metricsSchema.optional().default({}),
  weaknesses: z.array(weaknessSchema).max(100).optional().default([]),
  configurations: z.array(configurationSchema).max(100).optional().default([]),
  references: z.array(referenceSchema).max(500).optional().default([]),
}).passthrough();
const pageSchema = z.object({
  resultsPerPage: z.number().int().nonnegative().max(2000),
  startIndex: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  vulnerabilities: z.array(z.object({ cve: z.unknown() }).passthrough()).max(2000),
}).passthrough();

type SelectedMetric = { version: string; baseScore: number | null; baseSeverity: string; vectorString: string | null };

function selectMetric(metrics: z.infer<typeof metricsSchema>): SelectedMetric | null {
  const candidates: Array<[string, typeof metrics.cvssMetricV40]> = [
    ["4.0", metrics.cvssMetricV40],
    ["3.1", metrics.cvssMetricV31],
    ["3.0", metrics.cvssMetricV30],
  ];
  for (const [version, list] of candidates) {
    const metric = list?.[0]?.cvssData;
    if (!metric) continue;
    return {
      version,
      baseScore: metric.baseScore ?? null,
      baseSeverity: (metric.baseSeverity ?? "UNKNOWN").toUpperCase(),
      vectorString: metric.vectorString ?? null,
    };
  }
  return null;
}

function signalSeverity(value: string | undefined): "UNKNOWN" | "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const normalized = (value ?? "UNKNOWN").toUpperCase();
  return ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized)
    ? (normalized as "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
    : "UNKNOWN";
}

function EnglishDescriptions(cve: z.infer<typeof cveSchema>) {
  return cve.descriptions.filter((item) => item.lang.toLowerCase() === "en").slice(0, 3).map((item) => bounded(item.value, 4000));
}

function weaknessIds(cve: z.infer<typeof cveSchema>) {
  const values = cve.weaknesses.flatMap((weakness) => weakness.descriptions.map((item) => item.value));
  return [...new Set(values.filter((value) => /^(CWE-\d+|NVD-CWE-(?:Other|noinfo))$/.test(value)))].slice(0, 20);
}

function safeReferenceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || value.length > 2048) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function configurationSummaries(cve: z.infer<typeof cveSchema>) {
  const criteria: string[] = [];
  for (const configuration of cve.configurations) {
    for (const node of configuration.nodes) {
      for (const match of node.cpeMatch) {
        if (match.criteria) criteria.push(bounded(match.criteria, 1000));
        if (criteria.length >= 50) return criteria;
      }
    }
  }
  return criteria;
}

function fitFacts(input: {
  vulnStatus: string;
  sourceIdentifier: string;
  descriptions: string[];
  cvss: SelectedMetric | null;
  cwes: string[];
  references: Array<{ url: string; source: string; tags: string[] }>;
  affectedConfigurations: string[];
}) {
  const facts = structuredClone(input);
  while (Buffer.byteLength(JSON.stringify(facts)) > 60000 && facts.affectedConfigurations.length) facts.affectedConfigurations.pop();
  while (Buffer.byteLength(JSON.stringify(facts)) > 60000 && facts.references.length) facts.references.pop();
  while (Buffer.byteLength(JSON.stringify(facts)) > 60000 && facts.descriptions.length > 1) facts.descriptions.pop();
  if (Buffer.byteLength(JSON.stringify(facts)) > 65536) throw new Error("NVD_NORMALIZED_RECORD_TOO_LARGE");
  return facts;
}

export function mapNvdCve(raw: unknown, receivedAt: string): MappedTechnicalSignal {
  const cve = cveSchema.parse(raw);
  const publishedAt = canonicalInstant(cve.published);
  const effectiveAt = canonicalInstant(cve.lastModified);
  const descriptions = EnglishDescriptions(cve);
  const summary = descriptions[0] ?? `NVD record for ${cve.id}.`;
  const metric = selectMetric(cve.metrics);
  const cwes = weaknessIds(cve);
  const references = cve.references
    .map((reference) => ({ reference, url: safeReferenceUrl(reference.url) }))
    .filter((item): item is { reference: (typeof cve.references)[number]; url: string } => Boolean(item.url))
    .slice(0, 20)
    .map(({ reference, url }) => ({
      url,
      source: bounded(reference.source, 300),
      tags: (reference.tags ?? []).slice(0, 10),
    }));
  const facts = fitFacts({
    vulnStatus: cve.vulnStatus,
    sourceIdentifier: bounded(cve.sourceIdentifier, 500),
    descriptions,
    cvss: metric,
    cwes,
    references,
    affectedConfigurations: configurationSummaries(cve),
  });
  return {
    signal: {
      signalType: "VULNERABILITY_CHANGE",
      canonicalKey: `cve:${cve.id}`,
      title: bounded(`${cve.id}: ${summary}`, 500),
      summary: bounded(summary, 4000),
      lifecycle: "ACTIVE",
      severity: signalSeverity(metric?.baseSeverity),
      confidence: null,
      facts,
      publishedAt,
      observedAt: effectiveAt,
      effectiveAt,
    },
    observation: {
      sourceFamily: "VULNERABILITY",
      sourceSystem: "nvd-cve",
      sourceRecordKey: cve.id,
      sourceRevisionKey: effectiveAt,
      sourceUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      sourceTitle: bounded(`${cve.id}: ${summary}`, 500),
      sourcePublishedAt: publishedAt,
      sourceModifiedAt: effectiveAt,
      sourceObservedAt: effectiveAt,
      receivedAt,
      effectiveAt,
      sourceSnapshot: facts,
    },
    entityAssertions: [
      { entityKind: "CVE", displayValue: cve.id, normalizedValue: cve.id, semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
    ],
  };
}

export function nvdWindow(now: Date, cursor: unknown, initialLookbackHours: number) {
  const parsed = nvdCursorSchema.parse(cursor);
  const end = new Date(now);
  const initialStart = new Date(end.getTime() - initialLookbackHours * 60 * 60 * 1000);
  const cursorStart = parsed.lastModifiedWatermark ? new Date(new Date(parsed.lastModifiedWatermark).getTime() - OVERLAP_MS) : initialStart;
  const start = cursorStart;
  const boundedEnd = new Date(Math.min(end.getTime(), start.getTime() + MAX_WINDOW_MS));
  if (!(start < boundedEnd)) throw new CollectionError("INVALID_CURSOR", "The NVD cursor does not define a valid collection window.");
  return { start: start.toISOString(), end: boundedEnd.toISOString() };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNvdPages(context: Parameters<TechnicalSourceAdapter["collect"]>[0]) {
  const settings = z.object({ initialLookbackHours: z.number().int().min(1).max(168).optional().default(24) }).strict().parse(context.settings);
  const window = nvdWindow(context.now, context.cursor, settings.initialLookbackHours);
  const records: unknown[] = [];
  let successfulPages = 0;
  let requestCount = 0;
  let startIndex = 0;
  let totalResults = Number.POSITIVE_INFINITY;
  let pageSize = INITIAL_PAGE_SIZE;

  while (startIndex < totalResults) {
    if (successfulPages >= PAGE_LIMIT || requestCount >= REQUEST_LIMIT) {
      throw new CollectionError("PAGE_LIMIT_EXCEEDED", "The NVD request/page limit was exceeded.");
    }

    let response: Awaited<ReturnType<typeof fetchBoundedJson>>;
    while (true) {
      if (requestCount >= REQUEST_LIMIT) {
        throw new CollectionError("PAGE_LIMIT_EXCEEDED", "The NVD request/page limit was exceeded.");
      }
      if (requestCount > 0) await sleep(REQUEST_DELAY_MS);

      const url = new URL(NVD_CVE_URL);
      url.searchParams.set("lastModStartDate", window.start);
      url.searchParams.set("lastModEndDate", window.end);
      url.searchParams.set("startIndex", String(startIndex));
      url.searchParams.set("resultsPerPage", String(pageSize));
      const apiKey = process.env.NVD_API_KEY;

      requestCount += 1;
      try {
        response = await fetchBoundedJson({
          url,
          allowedHost: "services.nvd.nist.gov",
          allowedPath: "/rest/json/cves/2.0",
          maxBytes: RESPONSE_LIMIT_BYTES,
          timeoutMs: REQUEST_TIMEOUT_MS,
          headers: apiKey ? { apiKey } : undefined,
          fetchImpl: context.fetchImpl,
        });
        break;
      } catch (error) {
        if (
          error instanceof CollectionError &&
          (error.code === "HTTP_BODY_TOO_LARGE" || error.code === "HTTP_TIMEOUT") &&
          pageSize > MIN_PAGE_SIZE
        ) {
          pageSize = Math.max(MIN_PAGE_SIZE, Math.floor(pageSize / 2));
          continue;
        }
        throw error;
      }
    }

    const parsed = pageSchema.parse(response.json);
    if (parsed.startIndex !== startIndex || parsed.resultsPerPage > pageSize || parsed.vulnerabilities.length > pageSize) {
      throw new CollectionError("INVALID_SOURCE_RESPONSE", "NVD pagination was inconsistent.");
    }
    totalResults = parsed.totalResults;
    if (totalResults > RECORD_LIMIT) {
      throw new CollectionError("ITEM_LIMIT_EXCEEDED", "The NVD result window exceeded the 2,000-record run limit.");
    }
    for (const wrapper of parsed.vulnerabilities) {
      records.push(wrapper.cve);
      if (records.length > RECORD_LIMIT) throw new CollectionError("ITEM_LIMIT_EXCEEDED", "The NVD record limit was exceeded.");
    }
    const advanced = parsed.vulnerabilities.length;
    if (advanced === 0) break;
    startIndex += advanced;
    successfulPages += 1;
  }
  return { records, window };
}

export const nvdCveAdapter: TechnicalSourceAdapter = {
  metadata: {
    key: "NVD_CVE",
    displayName: "NVD CVE API 2.0",
    description: "Official NVD CVE last-modified windows mapped to source-backed VULNERABILITY_CHANGE signals.",
    sourceFamily: "VULNERABILITY",
    defaultIntervalMinutes: 120,
    minimumIntervalMinutes: 60,
    maximumIntervalMinutes: 1440,
    manual: true,
    scheduled: true,
    credentialRequirement: "OPTIONAL_SERVER_ENV",
    fixedHosts: ["services.nvd.nist.gov"],
  },
  async collect(context): Promise<AdapterCollectionResult> {
    const { records, window } = await fetchNvdPages(context);
    const signals: MappedTechnicalSignal[] = [];
    const issues = [];
    for (const raw of records) {
      try {
        signals.push(mapNvdCve(raw, context.now.toISOString()));
      } catch {
        const key = typeof raw === "object" && raw && "id" in raw ? String((raw as { id?: unknown }).id ?? "") : null;
        issues.push(safeIssue("INVALID_NVD_RECORD", "A malformed NVD CVE record was skipped.", key));
      }
    }
    return {
      recordsSeen: records.length,
      recordsMapped: signals.length,
      signals,
      issues: issues.slice(0, 100),
      nextCursor: { version: 1, lastModifiedWatermark: window.end },
    };
  },
};
