import { normalizeEntityLookup } from "./normalization";
import type { EntityAssertionGroup, EntityCandidate } from "./grouping";
import type { EntityAiSuggestion } from "./ai-resolver";
import type { TechnicalEntityKind } from "./types";

const deterministicKinds = new Set<TechnicalEntityKind>(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);
const aiAutoKinds = new Set<TechnicalEntityKind>(["VENDOR", "MALWARE", "PRODUCT"]);
const genericLabels = new Set([
  "multiple products",
  "various products",
  "unknown",
  "other",
  "multiple versions",
  "multiple devices",
  "all versions",
]);

export type AutoResolutionRejection =
  | "NOT_MATCH_EXISTING"
  | "NOT_HIGH_CONFIDENCE"
  | "DETERMINISTIC_KIND"
  | "KIND_NOT_ENABLED"
  | "GENERIC_LABEL"
  | "CANDIDATE_NOT_ALLOWED"
  | "CANDIDATE_INACTIVE"
  | "KIND_MISMATCH"
  | "CANDIDATE_NOT_STRONG"
  | "COMPETING_CANDIDATES"
  | "CONTEXT_CONFLICT";

export type AutoResolutionGateResult =
  | { eligible: true; entityId: string; reason: "SAFE_HIGH_MATCH" }
  | { eligible: false; reason: AutoResolutionRejection };

export type AutoResolutionEntity = {
  id: string;
  entityKind: TechnicalEntityKind;
  status: string;
};

export function isGenericEntityLabel(value: string) {
  return genericLabels.has(normalizeEntityLookup(value));
}

function contextParent(title: string, observed: string) {
  const normalizedTitle = normalizeEntityLookup(title);
  const normalizedObserved = normalizeEntityLookup(observed);
  const index = normalizedTitle.indexOf(normalizedObserved);
  if (index <= 0) return null;
  const prefix = normalizedTitle.slice(0, index).trim();
  const tokens = prefix.match(/[a-z0-9][a-z0-9._-]*/g) ?? [];
  return tokens.at(-1) ?? null;
}

export function hasProductContextConflict(group: Pick<EntityAssertionGroup, "entityKind" | "displayValue" | "normalizedValue"> & { sampleSignalTitles?: string[] }) {
  if (group.entityKind !== "PRODUCT") return false;
  const parents = new Set(
    (group.sampleSignalTitles ?? [])
      .map((title) => contextParent(title, group.normalizedValue || group.displayValue))
      .filter((value): value is string => Boolean(value)),
  );
  return parents.size > 1;
}

export function evaluateAiAutoResolution(input: {
  group: Pick<EntityAssertionGroup, "entityKind" | "displayValue" | "normalizedValue"> & { sampleSignalTitles?: string[] };
  suggestion: EntityAiSuggestion;
  candidates: EntityCandidate[];
  candidateEntity: AutoResolutionEntity | null;
}): AutoResolutionGateResult {
  const { group, suggestion, candidates, candidateEntity } = input;

  if (deterministicKinds.has(group.entityKind)) return { eligible: false, reason: "DETERMINISTIC_KIND" };
  if (!aiAutoKinds.has(group.entityKind)) return { eligible: false, reason: "KIND_NOT_ENABLED" };
  if (isGenericEntityLabel(group.normalizedValue || group.displayValue)) return { eligible: false, reason: "GENERIC_LABEL" };
  if (suggestion.decision !== "MATCH_EXISTING" || !suggestion.candidateEntityId) return { eligible: false, reason: "NOT_MATCH_EXISTING" };
  if (suggestion.confidence !== "HIGH") return { eligible: false, reason: "NOT_HIGH_CONFIDENCE" };

  const selected = candidates.find((candidate) => candidate.id === suggestion.candidateEntityId);
  if (!selected || !candidateEntity) return { eligible: false, reason: "CANDIDATE_NOT_ALLOWED" };
  if (candidateEntity.status !== "ACTIVE") return { eligible: false, reason: "CANDIDATE_INACTIVE" };
  if (candidateEntity.entityKind !== group.entityKind) return { eligible: false, reason: "KIND_MISMATCH" };

  // Exact/compact equality is strong enough for autonomous linking; weaker lexical
  // overlap remains suggestion-only. Competing strong candidates fail closed.
  const strongCandidates = candidates.filter((candidate) => candidate.score >= 80);
  if (selected.score < 80) return { eligible: false, reason: "CANDIDATE_NOT_STRONG" };
  if (strongCandidates.length !== 1 || strongCandidates[0].id !== selected.id) {
    return { eligible: false, reason: "COMPETING_CANDIDATES" };
  }

  if (group.entityKind === "PRODUCT" && hasProductContextConflict(group)) {
    return { eligible: false, reason: "CONTEXT_CONFLICT" };
  }

  return { eligible: true, entityId: selected.id, reason: "SAFE_HIGH_MATCH" };
}
