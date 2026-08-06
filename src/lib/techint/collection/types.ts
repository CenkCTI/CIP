import type { RecordTechnicalSignalInput } from "@/lib/techint/signals/schema";

export const technicalSourceKeys = ["TEST_SYNTHETIC", "CISA_KEV", "NVD_CVE"] as const;
export const technicalSourceStatuses = ["ENABLED", "PAUSED", "ARCHIVED"] as const;
export const collectionTriggers = ["MANUAL", "SCHEDULED", "TEST"] as const;
export const collectionIssueKinds = ["SKIPPED", "WARNING", "ERROR"] as const;

export type TechnicalSourceKey = (typeof technicalSourceKeys)[number];
export type TechnicalSourceStatus = (typeof technicalSourceStatuses)[number];
export type CollectionTrigger = (typeof collectionTriggers)[number];
export type CollectionIssueKind = (typeof collectionIssueKinds)[number];

export type SourceMetadata = {
  key: TechnicalSourceKey;
  displayName: string;
  description: string;
  sourceFamily: "MANUAL_TEST" | "VULNERABILITY";
  defaultIntervalMinutes: number;
  minimumIntervalMinutes: number;
  maximumIntervalMinutes: number;
  manual: boolean;
  scheduled: boolean;
  credentialRequirement: "NONE" | "OPTIONAL_SERVER_ENV";
  fixedHosts: readonly string[];
  testSynthetic?: boolean;
};

export type CollectionIssue = {
  kind: CollectionIssueKind;
  code: string;
  message: string;
  sourceRecordKey?: string | null;
};

export type MappedTechnicalSignal = Omit<RecordTechnicalSignalInput, "actorId">;

export type AdapterCollectionResult = {
  recordsSeen: number;
  recordsMapped: number;
  signals: MappedTechnicalSignal[];
  issues: CollectionIssue[];
  nextCursor: Record<string, unknown>;
};

export type AdapterContext = {
  now: Date;
  cursor: Record<string, unknown>;
  settings: Record<string, unknown>;
  fetchImpl: typeof fetch;
};

export type TechnicalSourceAdapter = {
  metadata: SourceMetadata;
  collect(context: AdapterContext): Promise<AdapterCollectionResult>;
};

export type CollectionCounters = {
  recordsSeen: number;
  recordsMapped: number;
  signalsCreated: number;
  observationsCreated: number;
  revisionsCreated: number;
  duplicateObservations: number;
  supportingObservations: number;
  staleObservations: number;
  conflictingObservations: number;
  skippedRecords: number;
  failedRecords: number;
};

export function emptyCollectionCounters(): CollectionCounters {
  return {
    recordsSeen: 0,
    recordsMapped: 0,
    signalsCreated: 0,
    observationsCreated: 0,
    revisionsCreated: 0,
    duplicateObservations: 0,
    supportingObservations: 0,
    staleObservations: 0,
    conflictingObservations: 0,
    skippedRecords: 0,
    failedRecords: 0,
  };
}
