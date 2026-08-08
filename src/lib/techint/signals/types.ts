export const signalTypes = ["VULNERABILITY_CHANGE", "ACTIVE_EXPLOITATION", "TECHNICAL_ADVISORY", "IOC_OBSERVATION", "MALWARE_ACTIVITY", "CAMPAIGN_REPORT", "INFRASTRUCTURE_CHANGE", "TTP_UPDATE", "PROVIDER_ALERT", "TECHNICAL_REPORT"] as const;
export const signalLifecycles = ["ACTIVE", "RETRACTED", "SUPERSEDED", "ARCHIVED"] as const;
export const signalSeverities = ["UNKNOWN", "INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const sourceFamilies = ["IOC_PROVIDER", "FEED", "VULNERABILITY", "ADVISORY", "STIX", "MANUAL_TEST", "OTHER"] as const;
export const entityKinds = ["CVE", "INDICATOR", "THREAT_ACTOR", "MALWARE", "CAMPAIGN", "INFRASTRUCTURE", "ATTACK_TECHNIQUE", "VENDOR", "PRODUCT", "SECTOR", "COUNTRY", "REGION", "TAG"] as const;
export const entityRoles = ["SUBJECT", "AFFECTS", "EXPLOITS", "USES", "ATTRIBUTED_TO", "TARGETS", "LOCATED_IN", "RELATED_TO", "MENTIONS"] as const;
export const recordingAssertionBases = ["PROVIDER_ASSERTED", "SYSTEM_EXTRACTED"] as const;
export const observationDispositions = ["CURRENT", "SUPPORTING", "STALE", "CONFLICTING"] as const;

export type TechnicalSignalType = (typeof signalTypes)[number];
export type TechnicalSignalSourceFamily = (typeof sourceFamilies)[number];
export type ObservationDisposition = (typeof observationDispositions)[number];
