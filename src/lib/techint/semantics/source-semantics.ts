import type { TechnicalSourceKey } from "@/lib/techint/collection/types";
import {
  TECHNICAL_SEMANTICS_VERSION,
  type TechnicalObservationSemantics,
  type TechnicalSourceSemanticMetadata,
} from "./types";

const sourceSemantics: Record<TechnicalSourceKey, TechnicalSourceSemanticMetadata> = {
  TEST_SYNTHETIC: {
    sourceClass: "UNKNOWN",
    authorityType: "UNKNOWN",
    collectionMode: "UNKNOWN",
    coverageSemantics: "Synthetic coverage only; it makes no claim about external technical activity.",
    freshnessSemantics: "UNKNOWN",
    defaultObservationBasis: "UNKNOWN",
    defaultSemanticKind: "UNKNOWN",
    represents: "Synthetic test data used to validate the collection pipeline.",
    doesNotRepresent: "Production technical activity or external threat intelligence.",
  },
  CISA_KEV: {
    sourceClass: "EXPLOITED_VULNERABILITY_CATALOG",
    authorityType: "GOVERNMENT",
    collectionMode: "CATALOG",
    coverageSemantics: "Selective catalog coverage of vulnerabilities CISA has added to KEV; it is not event-complete exploitation telemetry.",
    freshnessSemantics: "CATALOG_SNAPSHOT",
    defaultObservationBasis: "PUBLISHED",
    defaultSemanticKind: "KNOWN_EXPLOITED_VULNERABILITY",
    represents: "Vulnerabilities published by CISA in the Known Exploited Vulnerabilities catalog as known to have been exploited in the wild.",
    doesNotRepresent: "Direct CİTEM sensor observations, exhaustive worldwide exploit-event counts, or global attack volume.",
  },
  NVD_CVE: {
    sourceClass: "VULNERABILITY_DATABASE",
    authorityType: "GOVERNMENT",
    collectionMode: "DATABASE_FEED",
    coverageSemantics: "CVE records and NVD enrichment available through the NVD vulnerability database and modification feed.",
    freshnessSemantics: "EVENT_DRIVEN",
    defaultObservationBasis: "PUBLISHED",
    defaultSemanticKind: "VULNERABILITY_RECORD",
    represents: "Published and modified CVE records plus NVD vulnerability enrichment context.",
    doesNotRepresent: "Confirmed exploitation, attack occurrence, victim count, or organizational risk.",
  },
  FIRST_EPSS: {
    sourceClass: "EXPLOIT_PROBABILITY",
    authorityType: "MODEL_OR_SCORING_AUTHORITY",
    collectionMode: "SCORING_DATASET",
    coverageSemantics: "CVEs scored by the EPSS dataset for a scoring date; coverage is scoring coverage, not exploit-observation coverage.",
    freshnessSemantics: "PERIODIC_DATASET",
    defaultObservationBasis: "SCORED",
    defaultSemanticKind: "EXPLOIT_PROBABILITY_SCORE",
    represents: "A forward-looking probability estimate that a CVE will experience exploitation activity in the next 30 days.",
    doesNotRepresent: "Observed exploitation, attack count, CVSS severity, analyst confidence, or organizational risk.",
  },
  THREATFOX: {
    sourceClass: "IOC_SHARING",
    authorityType: "COMMUNITY_SHARING",
    collectionMode: "SHARING_FEED",
    coverageSemantics: "IOCs visible through ThreatFox sharing/submission data and the configured recent lookback window; coverage depends on contributors and provider retention.",
    freshnessSemantics: "FREQUENT_FEED",
    defaultObservationBasis: "REPORTED",
    defaultSemanticKind: "IOC_REPORT",
    represents: "Malicious indicators shared and reported through ThreatFox for malware-related intelligence.",
    doesNotRepresent: "One IOC as one attack, exhaustive global malicious infrastructure, measured global attack volume, attacker count, or victim count.",
  },
  MALWAREBAZAAR: {
    sourceClass: "MALWARE_SAMPLE_REPOSITORY",
    authorityType: "PLATFORM_OR_REPOSITORY",
    collectionMode: "REPOSITORY_FEED",
    coverageSemantics: "Malware sample records visible as recent repository additions; coverage reflects repository submissions, not infections or executions.",
    freshnessSemantics: "FREQUENT_FEED",
    defaultObservationBasis: "PUBLISHED",
    defaultSemanticKind: "MALWARE_SAMPLE_RECORD",
    represents: "Metadata for malware samples published as recent additions to the MalwareBazaar repository.",
    doesNotRepresent: "Malware execution, victim infection, one sample as one attack, attack count, or victim count.",
  },
};

const sourceSystemToKey: Readonly<Record<string, TechnicalSourceKey>> = {
  "test-synthetic": "TEST_SYNTHETIC",
  "cisa-kev": "CISA_KEV",
  "nvd-cve": "NVD_CVE",
  "first-epss": "FIRST_EPSS",
  threatfox: "THREATFOX",
  malwarebazaar: "MALWAREBAZAAR",
};

export function sourceSemanticMetadataForKey(sourceKey: TechnicalSourceKey): TechnicalSourceSemanticMetadata {
  return sourceSemantics[sourceKey];
}

export function observationSemanticsForSourceKey(sourceKey: TechnicalSourceKey): TechnicalObservationSemantics {
  const metadata = sourceSemanticMetadataForKey(sourceKey);
  return {
    sourceClass: metadata.sourceClass,
    observationBasis: metadata.defaultObservationBasis,
    semanticKind: metadata.defaultSemanticKind,
    semanticsVersion: TECHNICAL_SEMANTICS_VERSION,
    classificationBasis: sourceKey === "TEST_SYNTHETIC" ? "UNKNOWN" : "DETERMINISTIC_SOURCE_MAPPING",
  };
}

export function observationSemanticsForSourceSystem(sourceSystem: string): TechnicalObservationSemantics {
  const sourceKey = sourceSystemToKey[sourceSystem.trim().toLowerCase()];
  if (sourceKey) return observationSemanticsForSourceKey(sourceKey);
  return {
    sourceClass: "UNKNOWN",
    observationBasis: "UNKNOWN",
    semanticKind: "UNKNOWN",
    semanticsVersion: TECHNICAL_SEMANTICS_VERSION,
    classificationBasis: "UNKNOWN",
  };
}
