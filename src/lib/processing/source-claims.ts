export const sourceClaimKinds = [
  "GENERAL",
  "BEHAVIOR",
  "TARGETING",
  "CAPABILITY",
  "RELATIONSHIP",
  "INTENT_OBJECTIVE",
  "IMPACT",
  "TECHNICAL_CONTEXT",
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
  GENERAL: "General",
  BEHAVIOR: "Behavior",
  TARGETING: "Targeting",
  CAPABILITY: "Capability",
  RELATIONSHIP: "Relationship",
  INTENT_OBJECTIVE: "Intent / objective",
  IMPACT: "Impact",
  TECHNICAL_CONTEXT: "Technical context",
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
