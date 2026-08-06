import "server-only";

import { z } from "zod";
import { cisaKevCursorSchema } from "../schema";
import { bounded, cisaReleaseInstant, collapseWhitespace, dateOnlyInstant, safeIssue } from "../mapping";
import { fetchBoundedJson } from "../transport";
import type { AdapterCollectionResult, MappedTechnicalSignal, TechnicalSourceAdapter } from "../types";

export const CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const entrySchema = z
  .object({
    cveID: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
    vendorProject: z.string().max(500),
    product: z.string().max(500),
    vulnerabilityName: z.string().max(1000),
    dateAdded: z.string(),
    shortDescription: z.string().max(10000),
    requiredAction: z.string().max(10000),
    dueDate: z.string(),
    knownRansomwareCampaignUse: z.string().max(100),
    notes: z.string().max(10000).optional().default(""),
    cwes: z.array(z.string().max(100)).max(20).optional().default([]),
  })
  .passthrough();

const catalogSchema = z
  .object({
    title: z.string().optional(),
    catalogVersion: z.string().min(1).max(100),
    dateReleased: z.string().min(1).max(100),
    count: z.number().int().nonnegative().optional(),
    vulnerabilities: z.array(z.unknown()).max(5000),
  })
  .passthrough();

export function mapCisaKevCatalog(payload: unknown, receivedAt: string, headers?: { etag?: string; lastModified?: string }): AdapterCollectionResult {
  const catalog = catalogSchema.parse(payload);
  const effectiveAt = cisaReleaseInstant(catalog.dateReleased);
  const releaseIdentity = `${catalog.catalogVersion}:${catalog.dateReleased}`.slice(0, 200);
  const signals: MappedTechnicalSignal[] = [];
  const issues = [];

  for (const raw of catalog.vulnerabilities) {
    const parsed = entrySchema.safeParse(raw);
    if (!parsed.success) {
      const key = typeof raw === "object" && raw && "cveID" in raw ? String((raw as { cveID?: unknown }).cveID ?? "") : null;
      issues.push(safeIssue("INVALID_KEV_RECORD", "A malformed CISA KEV entry was skipped.", key));
      continue;
    }
    const item = parsed.data;
    let dateAdded: string;
    let dueDate: string;
    try {
      dateAdded = dateOnlyInstant(item.dateAdded);
      dueDate = dateOnlyInstant(item.dueDate);
    } catch {
      issues.push(safeIssue("INVALID_KEV_DATE", "A CISA KEV entry with an invalid date was skipped.", item.cveID));
      continue;
    }
    const vendor = collapseWhitespace(item.vendorProject);
    const product = collapseWhitespace(item.product);
    const facts = {
      cveID: item.cveID,
      vendorProject: vendor,
      product,
      vulnerabilityName: bounded(item.vulnerabilityName, 1000),
      shortDescription: bounded(item.shortDescription, 4000),
      dateAdded: item.dateAdded,
      dueDate: item.dueDate,
      requiredAction: bounded(item.requiredAction, 4000),
      knownRansomwareCampaignUse: bounded(item.knownRansomwareCampaignUse, 100),
      notes: bounded(item.notes, 2000),
      cwes: item.cwes.slice(0, 20),
    };
    const sourceSnapshot = {
      ...facts,
      catalogVersion: catalog.catalogVersion,
      catalogDateReleased: catalog.dateReleased,
    };
    signals.push({
      signal: {
        signalType: "ACTIVE_EXPLOITATION",
        canonicalKey: `cve:${item.cveID}`,
        title: bounded(`Known exploited vulnerability ${item.cveID}: ${item.vulnerabilityName}`, 500),
        summary: bounded(item.shortDescription, 4000),
        lifecycle: "ACTIVE",
        severity: "UNKNOWN",
        confidence: null,
        facts,
        publishedAt: dateAdded,
        observedAt: dateAdded,
        effectiveAt,
      },
      observation: {
        sourceFamily: "VULNERABILITY",
        sourceSystem: "cisa-kev",
        sourceRecordKey: item.cveID,
        sourceRevisionKey: releaseIdentity,
        sourceUrl: CISA_KEV_URL,
        sourceTitle: bounded(item.vulnerabilityName, 500),
        sourcePublishedAt: dateAdded,
        sourceModifiedAt: effectiveAt,
        sourceObservedAt: dateAdded,
        receivedAt,
        effectiveAt,
        sourceSnapshot,
      },
      entityAssertions: [
        { entityKind: "CVE", displayValue: item.cveID, normalizedValue: item.cveID, semanticRole: "SUBJECT", assertionBasis: "PROVIDER_ASSERTED", confidence: null },
        ...(vendor ? [{ entityKind: "VENDOR" as const, displayValue: vendor, normalizedValue: vendor, semanticRole: "AFFECTS" as const, assertionBasis: "PROVIDER_ASSERTED" as const, confidence: null }] : []),
        ...(product ? [{ entityKind: "PRODUCT" as const, displayValue: product, normalizedValue: product, semanticRole: "AFFECTS" as const, assertionBasis: "PROVIDER_ASSERTED" as const, confidence: null }] : []),
      ],
    });
  }

  return {
    recordsSeen: catalog.vulnerabilities.length,
    recordsMapped: signals.length,
    signals,
    issues: issues.slice(0, 100),
    nextCursor: {
      version: 1,
      catalogRelease: releaseIdentity,
      ...(headers?.etag ? { etag: headers.etag } : {}),
      ...(headers?.lastModified ? { lastModified: headers.lastModified } : {}),
    },
  };
}

export const cisaKevAdapter: TechnicalSourceAdapter = {
  metadata: {
    key: "CISA_KEV",
    displayName: "CISA Known Exploited Vulnerabilities",
    description: "Official CISA catalog mapped to source-backed ACTIVE_EXPLOITATION Technical Signals.",
    sourceFamily: "VULNERABILITY",
    defaultIntervalMinutes: 360,
    minimumIntervalMinutes: 60,
    maximumIntervalMinutes: 1440,
    manual: true,
    scheduled: true,
    credentialRequirement: "NONE",
    fixedHosts: ["www.cisa.gov"],
  },
  async collect(context) {
    const cursor = cisaKevCursorSchema.parse(context.cursor);
    const headers: Record<string, string> = {};
    if (cursor.etag) headers["if-none-match"] = cursor.etag;
    if (cursor.lastModified) headers["if-modified-since"] = cursor.lastModified;
    const response = await fetchBoundedJson({
      url: new URL(CISA_KEV_URL),
      allowedHost: "www.cisa.gov",
      allowedPath: "/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      maxBytes: 12 * 1024 * 1024,
      headers,
      fetchImpl: context.fetchImpl,
    });
    if (response.status === 304) {
      return {
        recordsSeen: 0,
        recordsMapped: 0,
        signals: [],
        issues: [],
        nextCursor: {
          ...cursor,
          ...(response.etag ? { etag: response.etag } : {}),
          ...(response.lastModified ? { lastModified: response.lastModified } : {}),
        },
      };
    }
    return mapCisaKevCatalog(response.json, context.now.toISOString(), response);
  },
};
