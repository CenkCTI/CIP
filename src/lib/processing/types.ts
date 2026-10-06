export const processingDestinations = [
  "indicator",
  "malware",
  "cve",
  "mitre",
  "campaign",
  "actor",
  "attribution_claim",
] as const;

export type ProcessingDestination = (typeof processingDestinations)[number];

export const annotationProcessingStates = [
  "UNPROCESSED",
  "PROCESSED",
  "IGNORED",
] as const;

export type AnnotationProcessingState =
  (typeof annotationProcessingStates)[number];

export const mappingOrigins = [
  "SOURCE_EXPLICIT",
  "ANALYST_MAPPED",
  "REFERENCE_MAPPED",
  "AI_SUGGESTED",
] as const;

export type MappingOrigin = (typeof mappingOrigins)[number];

export type ProcessingActionState = {
  error?: string;
  success?: string;
  targetId?: string;
  targetType?: string;
  linkedExisting?: boolean;
};

export type ProcessingOption = {
  id: string;
  label: string;
  detail?: string;
};
