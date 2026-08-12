#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { explicitShadowWindow, shadowWindowColumn } from "./node2g-shadow-window.mjs";

const SOURCE_CONFIG = {
  CISA_KEV: {
    sourceSystem: "cisa-kev",
    sourceClass: "EXPLOITED_VULNERABILITY_CATALOG",
    observationBasis: "PUBLISHED",
    subjectKind: "CVE",
  },
  NVD_CVE: {
    sourceSystem: "nvd-cve",
    sourceClass: "VULNERABILITY_DATABASE",
    // Legacy CİTEM labels NVD collection as PUBLISHED. NODE-2G treats this as
    // semantically equivalent to Node's ENRICHED basis for this source only.
    observationBasis: "PUBLISHED",
    subjectKind: "CVE",
  },
  FIRST_EPSS: {
    sourceSystem: "first-epss",
    sourceClass: "EXPLOIT_PROBABILITY",
    observationBasis: "SCORED",
    subjectKind: "CVE",
  },
  THREATFOX: {
    sourceSystem: "threatfox",
    sourceClass: "IOC_SHARING",
    observationBasis: "REPORTED",
    subjectKind: "INDICATOR",
  },
  MALWAREBAZAAR: {
    sourceSystem: "malwarebazaar",
    sourceClass: "MALWARE_SAMPLE_REPOSITORY",
    observationBasis: "PUBLISHED",
    subjectKind: "HASH",
  },
};

const sourceKey = process.argv[2];
const rawSnapshotId = process.argv[3]?.trim();
const upstreamSnapshotId = rawSnapshotId && rawSnapshotId !== "-" ? rawSnapshotId : null;
const windowStartRaw = process.argv[4]?.trim() || null;
const windowEndRaw = process.argv[5]?.trim() || null;
const config = SOURCE_CONFIG[sourceKey];
if (!config) {
  console.error(`Usage: node scripts/node2g-shadow-export.mjs <${Object.keys(SOURCE_CONFIG).join("|")}> [upstreamSnapshotId|-] [windowStart] [windowEnd]`);
  process.exit(2);
}

function epssScoreDate() {
  if (sourceKey !== "FIRST_EPSS") return null;
  if (!upstreamSnapshotId) {
    throw new Error("FIRST_EPSS shadow export requires upstreamSnapshotId in EPSS:YYYY-MM-DD form so different score dates cannot be mixed.");
  }
  const match = /^EPSS:(\d{4}-\d{2}-\d{2})$/.exec(upstreamSnapshotId);
  if (!match) throw new Error("FIRST_EPSS upstreamSnapshotId must use EPSS:YYYY-MM-DD form.");
  const parsed = Date.parse(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== match[1]) {
    throw new Error("FIRST_EPSS upstreamSnapshotId contains an invalid score date.");
  }
  return match[1];
}

const requestedWindow = explicitShadowWindow(sourceKey, windowStartRaw, windowEndRaw);
const requestedEpssScoreDate = epssScoreDate();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const requestedOwnerId = process.env.CITEM_NODE2G_OWNER_ID?.trim() || null;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 1000;
const MAX_ROWS = 20_000;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return typeof value === "string" ? value : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function iso(value) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

async function fetchObservations() {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabase
      .from("technical_signal_observations")
      .select("owner_id,source_record_key,source_published_at,source_modified_at,source_observed_at,received_at,effective_at,source_snapshot,created_at")
      .eq("source_system", config.sourceSystem)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (requestedOwnerId) query = query.eq("owner_id", requestedOwnerId);
    if (requestedWindow) {
      const windowColumn = shadowWindowColumn(sourceKey);
      query = query
        .gte(windowColumn, requestedWindow.start)
        .lte(windowColumn, requestedWindow.end);
    }
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    if (rows.length >= MAX_ROWS) throw new Error(`CİTEM shadow export exceeded ${MAX_ROWS} observation rows; narrow the acceptance environment before continuing.`);
  }
  return rows;
}

function projectFacts(row) {
  const snapshot = object(row.source_snapshot);
  switch (sourceKey) {
    case "CISA_KEV": {
      const cve = text(snapshot.cveID) ?? row.source_record_key;
      return {
        subject: { kind: "CVE", value: cve },
        facts: {
          cve,
          dateAdded: text(snapshot.dateAdded),
          dueDate: text(snapshot.dueDate),
          vendor: text(snapshot.vendorProject),
          product: text(snapshot.product),
          ransomwareUse: text(snapshot.knownRansomwareCampaignUse),
        },
      };
    }
    case "NVD_CVE": {
      const cve = row.source_record_key;
      return {
        subject: { kind: "CVE", value: cve },
        facts: {
          cve,
          published: iso(row.source_published_at),
          lastModified: iso(row.source_modified_at),
          vulnStatus: text(snapshot.vulnStatus),
        },
      };
    }
    case "FIRST_EPSS": {
      const cve = text(snapshot.cve) ?? row.source_record_key;
      return {
        subject: { kind: "CVE", value: cve },
        facts: {
          cve,
          score: finiteNumber(snapshot.epss) ?? text(snapshot.epss),
          percentile: finiteNumber(snapshot.percentile) ?? text(snapshot.percentile),
          scoreDate: text(snapshot.scoreDate),
        },
      };
    }
    case "THREATFOX": {
      const metadata = object(snapshot.metadata);
      const providerId = text(snapshot.providerItemId) ?? row.source_record_key;
      const indicatorValue = text(snapshot.originalValue) ?? text(snapshot.indicatorValue) ?? row.source_record_key;
      return {
        subject: { kind: "INDICATOR", value: indicatorValue },
        facts: {
          providerId,
          indicatorType: text(metadata.ioc_type),
          indicatorValue,
          firstSeen: iso(text(snapshot.firstSeen) ?? row.source_published_at),
          lastSeen: iso(text(snapshot.lastSeen) ?? row.source_modified_at),
          malwareFamily: text(snapshot.malwareFamily),
          providerConfidence: finiteNumber(snapshot.providerConfidence),
        },
      };
    }
    case "MALWAREBAZAAR": {
      const sha256 = (text(snapshot.sha256) ?? row.source_record_key).toLowerCase();
      return {
        subject: { kind: "HASH", value: sha256 },
        facts: {
          sha256,
          sha1: text(snapshot.sha1)?.toLowerCase() ?? null,
          md5: text(snapshot.md5)?.toLowerCase() ?? null,
          firstSeen: iso(row.source_published_at),
          lastSeen: iso(row.source_modified_at),
          fileName: text(snapshot.fileName),
          fileSize: finiteNumber(snapshot.fileSize),
          fileType: text(snapshot.fileType),
          fileTypeMime: text(snapshot.fileTypeMime),
          signature: text(snapshot.signature),
          reporter: text(snapshot.reporter),
          tags: Array.isArray(snapshot.tags) ? snapshot.tags : null,
        },
      };
    }
    default:
      throw new Error(`Unsupported source ${sourceKey}`);
  }
}

const observations = await fetchObservations();
const scopedObservations = requestedEpssScoreDate
  ? observations.filter((row) => text(object(row.source_snapshot).scoreDate) === requestedEpssScoreDate)
  : observations;
if (scopedObservations.length === 0) {
  const scope = requestedWindow
    ? ` in window ${requestedWindow.start}..${requestedWindow.end}`
    : requestedEpssScoreDate
      ? ` for score date ${requestedEpssScoreDate}`
      : "";
  throw new Error(`No CİTEM Technical Signal observations found for ${sourceKey}${scope}. Run the bounded legacy shadow collector in the acceptance workspace first.`);
}

const ownerIds = [...new Set(scopedObservations.map((row) => row.owner_id))];
if (!requestedOwnerId && ownerIds.length !== 1) {
  throw new Error(`Expected exactly one CİTEM owner in the shadow export, found ${ownerIds.length}. Set CITEM_NODE2G_OWNER_ID explicitly.`);
}
const ownerId = requestedOwnerId ?? ownerIds[0];
const latestByIdentity = new Map();
for (const row of scopedObservations) {
  if (row.owner_id !== ownerId) continue;
  latestByIdentity.set(row.source_record_key, row);
}

const records = [...latestByIdentity.values()]
  .sort((a, b) => a.source_record_key.localeCompare(b.source_record_key))
  .map((row) => {
    const projected = projectFacts(row);
    return {
      sourceRecordId: row.source_record_key,
      subject: projected.subject,
      times: {
        publishedAt: iso(row.source_published_at),
        effectiveAt: iso(row.effective_at),
        upstreamUpdatedAt: iso(row.source_modified_at),
      },
      facts: projected.facts,
    };
  });

const received = scopedObservations
  .filter((row) => row.owner_id === ownerId)
  .map((row) => iso(row.received_at))
  .filter(Boolean)
  .sort();

const snapshot = {
  schemaVersion: "NODE2G_PARITY_V1",
  producer: "CITEM",
  sourceKey,
  capturedAt: new Date().toISOString(),
  upstreamSnapshotId,
  window: requestedWindow ?? {
    start: received[0] ?? null,
    end: received.at(-1) ?? null,
  },
  semantics: {
    sourceClass: config.sourceClass,
    observationBasis: config.observationBasis,
  },
  records,
};

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
