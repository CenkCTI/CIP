export const TECHINT_MATCHING_ENGINE_VERSION = "2.3E-v1";

export const profileRelevanceLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const profileMatchQualities = ["CONTEXTUAL", "PROVISIONAL", "CONFIRMED"] as const;
export type ProfileRelevanceLevel = (typeof profileRelevanceLevels)[number];
export type ProfileMatchQuality = (typeof profileMatchQualities)[number];

export type MatchProfileItem = {
  id: string;
  kind: string;
  normalizedValue: string;
  semanticRole?: string | null;
  active?: boolean;
};

export type MatchSignalAssertion = {
  id: string;
  kind: string;
  normalizedValue: string;
  semanticRole?: string | null;
  resolutionStatus?: "RESOLVED" | "NEEDS_REVIEW" | "DISMISSED" | null;
  resolvedEntityId?: string | null;
  resolvedCanonicalNormalized?: string | null;
};

export type ProfileMatchingInput = {
  title: string;
  summary?: string;
  profileItems: MatchProfileItem[];
  assertions: MatchSignalAssertion[];
};

export type ProfileMatchingResult = {
  matched: boolean;
  relevance: ProfileRelevanceLevel | null;
  matchQuality: ProfileMatchQuality | null;
  internalScore: number;
  reasonCodes: string[];
  matchedProfileItemIds: string[];
  matchedEntityIds: string[];
  matchedAssertionIds: string[];
  pendingAssertionIds: string[];
  pendingIdentityCount: number;
  engineVersion: typeof TECHINT_MATCHING_ENGINE_VERSION;
};

const deterministicKinds = new Set(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);
const contextualKinds = new Set(["SECTOR", "COUNTRY", "REGION", "TAG"]);

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function roleMatches(profileRole: string | null | undefined, signalRole: string | null | undefined) {
  if (profileRole === "INFRASTRUCTURE_LOCATION") return signalRole === "LOCATED_IN";
  if (profileRole === "TARGET" || profileRole === "AFFECTED_REGION") return signalRole === "TARGETS" || signalRole === "AFFECTS";
  return true;
}

export function profileRelevanceForScore(score: number): ProfileRelevanceLevel {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  if (bounded >= 40) return "HIGH";
  if (bounded >= 20) return "MEDIUM";
  return "LOW";
}

export function evaluateProfileMatch(input: ProfileMatchingInput): ProfileMatchingResult {
  const items = input.profileItems.filter((item) => item.active !== false);
  const assertions = input.assertions.filter((assertion) => assertion.resolutionStatus !== "DISMISSED");
  const pending = assertions.filter(
    (assertion) => !deterministicKinds.has(assertion.kind) && (!assertion.resolutionStatus || assertion.resolutionStatus === "NEEDS_REVIEW"),
  );
  let score = 0;
  let qualityRank = 0;
  const reasons = new Set<string>();
  const itemIds = new Set<string>();
  const entityIds = new Set<string>();
  const assertionIds = new Set<string>();

  for (const item of items) {
    if (contextualKinds.has(item.kind) || item.kind === "KEYWORD") continue;
    const itemValue = normalize(item.normalizedValue);
    for (const assertion of assertions) {
      if (assertion.kind !== item.kind) continue;
      const canonical = assertion.resolvedCanonicalNormalized ? normalize(assertion.resolvedCanonicalNormalized) : null;
      if (assertion.resolutionStatus === "RESOLVED" && canonical === itemValue) {
        score += 50;
        qualityRank = Math.max(qualityRank, 3);
        reasons.add(`DIRECT_CANONICAL:${item.id}`);
        itemIds.add(item.id);
        assertionIds.add(assertion.id);
        if (assertion.resolvedEntityId) entityIds.add(assertion.resolvedEntityId);
      } else if ((!assertion.resolutionStatus || assertion.resolutionStatus === "NEEDS_REVIEW") && normalize(assertion.normalizedValue) === itemValue) {
        score += 40;
        qualityRank = Math.max(qualityRank, 2);
        reasons.add(`DIRECT_SOURCE:${item.id}`);
        itemIds.add(item.id);
        assertionIds.add(assertion.id);
      }
    }
  }

  const searchableText = normalize(`${input.title} ${input.summary ?? ""}`);
  const vendors = assertions.filter((assertion) => assertion.kind === "VENDOR");
  const unresolvedProducts = assertions.filter(
    (assertion) => assertion.kind === "PRODUCT" && (!assertion.resolutionStatus || assertion.resolutionStatus === "NEEDS_REVIEW"),
  );
  for (const item of items.filter((candidate) => candidate.kind === "PRODUCT")) {
    const profileProduct = normalize(item.normalizedValue);
    if (!searchableText.includes(profileProduct)) continue;
    for (const product of unresolvedProducts) {
      const compound = vendors.some((vendor) => normalize(`${vendor.normalizedValue} ${product.normalizedValue}`) === profileProduct);
      if (!compound) continue;
      score += 40;
      qualityRank = Math.max(qualityRank, 2);
      reasons.add(`PRODUCT_CONTEXT:${item.id}`);
      itemIds.add(item.id);
      assertionIds.add(product.id);
      break;
    }
  }

  for (const item of items.filter((candidate) => contextualKinds.has(candidate.kind))) {
    const itemValue = normalize(item.normalizedValue);
    for (const assertion of assertions) {
      if (assertion.kind !== item.kind || normalize(assertion.normalizedValue) !== itemValue) continue;
      if ((item.kind === "COUNTRY" || item.kind === "REGION") && !roleMatches(item.semanticRole, assertion.semanticRole)) continue;
      score += 20;
      qualityRank = Math.max(qualityRank, 1);
      reasons.add(`CONTEXT:${item.id}`);
      itemIds.add(item.id);
      assertionIds.add(assertion.id);
    }
  }

  for (const item of items.filter((candidate) => candidate.kind === "KEYWORD")) {
    const keyword = normalize(item.normalizedValue);
    if (keyword.length < 3 || !searchableText.includes(keyword)) continue;
    score += 10;
    qualityRank = Math.max(qualityRank, 1);
    reasons.add(`KEYWORD:${item.id}`);
    itemIds.add(item.id);
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const matched = itemIds.size > 0;
  return {
    matched,
    relevance: matched ? profileRelevanceForScore(boundedScore) : null,
    matchQuality: !matched ? null : qualityRank >= 3 ? "CONFIRMED" : qualityRank === 2 ? "PROVISIONAL" : "CONTEXTUAL",
    internalScore: boundedScore,
    reasonCodes: [...reasons],
    matchedProfileItemIds: [...itemIds],
    matchedEntityIds: [...entityIds],
    matchedAssertionIds: [...assertionIds],
    pendingAssertionIds: pending.map((assertion) => assertion.id),
    pendingIdentityCount: pending.length,
    engineVersion: TECHINT_MATCHING_ENGINE_VERSION,
  };
}

export function profileMatchReasonLabel(code: string, itemLabels: Map<string, string> = new Map()) {
  const [basis, itemId] = code.split(":", 2);
  const item = itemId ? itemLabels.get(itemId) : null;
  if (basis === "DIRECT_CANONICAL") return `Confirmed canonical match${item ? `: ${item}` : ""}`;
  if (basis === "DIRECT_SOURCE") return `Direct source-backed match${item ? `: ${item}` : ""}`;
  if (basis === "PRODUCT_CONTEXT") return `Product context match${item ? `: ${item}` : ""}`;
  if (basis === "CONTEXT") return `Context match${item ? `: ${item}` : ""}`;
  if (basis === "KEYWORD") return `Watched keyword${item ? `: ${item}` : ""}`;
  if (code === "INVESTIGATION_SCOPE") return "Related to the active Investigation profile scope";
  return code.replaceAll("_", " ").toLowerCase();
}
