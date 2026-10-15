export const sourceClaimKinds = [
  "TARGETING",
  "OPERATIONAL_PURPOSE",
  "OPERATIONAL_OUTCOME",
  "INFRASTRUCTURE",
  "GEOPOLITICAL_CONTEXT",
  "CAPABILITY",
  "SOURCE_ASSESSMENT",
  "OTHER",
] as const;

export type SourceClaimKind = (typeof sourceClaimKinds)[number];

export const sourceClaimStances = [
  "ASSERTS",
  "DENIES",
  "QUALIFIES",
  "UNCLEAR",
] as const;

export type SourceClaimStance = (typeof sourceClaimStances)[number];

export const sourceClaimKindLabels: Record<SourceClaimKind, string> = {
  TARGETING: "TARGETING",
  OPERATIONAL_PURPOSE: "OPERATIONAL_PURPOSE",
  OPERATIONAL_OUTCOME: "OPERATIONAL_OUTCOME",
  INFRASTRUCTURE: "INFRASTRUCTURE",
  GEOPOLITICAL_CONTEXT: "GEOPOLITICAL_CONTEXT",
  CAPABILITY: "CAPABILITY",
  SOURCE_ASSESSMENT: "SOURCE_ASSESSMENT",
  OTHER: "OTHER",
};

export const sourceClaimStanceLabels: Record<SourceClaimStance, string> = {
  ASSERTS: "Asserts",
  DENIES: "Denies",
  QUALIFIES: "Qualifies",
  UNCLEAR: "Unclear",
};

export const sourceClaimStanceHelp: Record<SourceClaimStance, string> = {
  ASSERTS: "The source presents the proposition as true or observed.",
  DENIES: "The source explicitly rejects or reports absence of the proposition.",
  QUALIFIES: "The source narrows, conditions, or hedges the proposition.",
  UNCLEAR: "The source position cannot be normalized without overstating it.",
};
