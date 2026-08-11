export const technicalSourceClasses = [
  "VULNERABILITY_DATABASE",
  "EXPLOITED_VULNERABILITY_CATALOG",
  "EXPLOIT_PROBABILITY",
  "IOC_SHARING",
  "MALWARE_SAMPLE_REPOSITORY",
  "OFFICIAL_ADVISORY",
  "CERT_CSIRT_REPORTING",
  "THREAT_RESEARCH",
  "CAMPAIGN_REPORTING",
  "INFRASTRUCTURE_TELEMETRY",
  "DNS_OBSERVATION",
  "CERTIFICATE_OBSERVATION",
  "ROUTING_TELEMETRY",
  "UNKNOWN",
] as const;

export const technicalObservationBases = ["OBSERVED", "REPORTED", "PUBLISHED", "SCORED", "ENRICHED", "UNKNOWN"] as const;

export const technicalSemanticKinds = [
  "VULNERABILITY_RECORD",
  "KNOWN_EXPLOITED_VULNERABILITY",
  "EXPLOIT_PROBABILITY_SCORE",
  "IOC_REPORT",
  "MALWARE_SAMPLE_RECORD",
  "UNKNOWN",
] as const;

export const technicalAuthorityTypes = [
  "GOVERNMENT",
  "CERT_CSIRT",
  "STANDARDS_OR_NONPROFIT",
  "COMMUNITY_SHARING",
  "RESEARCH_ORGANIZATION",
  "COMMERCIAL_PROVIDER",
  "PLATFORM_OR_REPOSITORY",
  "MODEL_OR_SCORING_AUTHORITY",
  "UNKNOWN",
] as const;

export const technicalSemanticCollectionModes = [
  "CATALOG",
  "DATABASE_FEED",
  "SCORING_DATASET",
  "SHARING_FEED",
  "REPOSITORY_FEED",
  "ADVISORY_PUBLICATION",
  "REPORT_PUBLICATION",
  "TELEMETRY_STREAM",
  "ENRICHMENT_LOOKUP",
  "UNKNOWN",
] as const;

export const technicalFreshnessSemantics = [
  "EVENT_DRIVEN",
  "PERIODIC_DATASET",
  "FREQUENT_FEED",
  "CATALOG_SNAPSHOT",
  "LOOKUP_ENRICHMENT",
  "UNKNOWN",
] as const;

export const technicalSemanticClassificationBases = [
  "DETERMINISTIC_SOURCE_MAPPING",
  "DETERMINISTIC_RECORD_MAPPING",
  "UNKNOWN",
] as const;

export type TechnicalSourceClass = (typeof technicalSourceClasses)[number];
export type TechnicalObservationBasis = (typeof technicalObservationBases)[number];
export type TechnicalSemanticKind = (typeof technicalSemanticKinds)[number];
export type TechnicalAuthorityType = (typeof technicalAuthorityTypes)[number];
export type TechnicalSemanticCollectionMode = (typeof technicalSemanticCollectionModes)[number];
export type TechnicalFreshnessSemantic = (typeof technicalFreshnessSemantics)[number];
export type TechnicalSemanticClassificationBasis = (typeof technicalSemanticClassificationBases)[number];

export const TECHNICAL_SEMANTICS_VERSION = "2.3F-C-v1" as const;

export type TechnicalObservationSemantics = {
  sourceClass: TechnicalSourceClass;
  observationBasis: TechnicalObservationBasis;
  semanticKind: TechnicalSemanticKind;
  semanticsVersion: string;
  classificationBasis: TechnicalSemanticClassificationBasis;
};

export type TechnicalSourceSemanticMetadata = {
  sourceClass: TechnicalSourceClass;
  authorityType: TechnicalAuthorityType;
  collectionMode: TechnicalSemanticCollectionMode;
  freshnessSemantics: TechnicalFreshnessSemantic;
  defaultObservationBasis: TechnicalObservationBasis;
  defaultSemanticKind: TechnicalSemanticKind;
  represents: string;
  doesNotRepresent: string;
};
