import { normalizeEntityLookup } from "./normalization";
import type { TechnicalEntityKind } from "./types";

type AssertionRow = {
  id: string;
  entity_kind: TechnicalEntityKind;
  display_value: string;
  normalized_value: string;
  semantic_role?: string | null;
  source_observation_id?: string | null;
  signal_id?: string | null;
};

type ResolutionRow = {
  assertion_id: string;
  status: string;
};

type EntityRow = {
  id: string;
  entity_kind: TechnicalEntityKind;
  canonical_name: string;
  canonical_normalized: string;
  status?: string | null;
};

export type EntityAssertionGroup = {
  key: string;
  entityKind: TechnicalEntityKind;
  displayValue: string;
  normalizedValue: string;
  occurrenceCount: number;
  assertionIds: string[];
  semanticRoles: string[];
  sourceObservationIds: string[];
  signalIds: string[];
};

export type EntityCandidate = {
  id: string;
  canonicalName: string;
  canonicalNormalized: string;
  score: number;
};

export function entityGroupKey(kind: TechnicalEntityKind, normalizedValue: string) {
  return `${kind}\u001f${normalizedValue}`;
}

export function groupUnresolvedAssertions(assertions: AssertionRow[], resolutions: ResolutionRow[]) {
  const statusByAssertion = new Map(resolutions.map((row) => [row.assertion_id, row.status]));
  const groups = new Map<string, EntityAssertionGroup>();

  for (const assertion of assertions) {
    const status = statusByAssertion.get(assertion.id);
    if (status && status !== "NEEDS_REVIEW") continue;
    const normalizedValue = normalizeEntityLookup(assertion.normalized_value || assertion.display_value);
    const key = entityGroupKey(assertion.entity_kind, normalizedValue);
    const current = groups.get(key);
    if (current) {
      current.occurrenceCount += 1;
      current.assertionIds.push(assertion.id);
      if (assertion.semantic_role && !current.semanticRoles.includes(assertion.semantic_role)) current.semanticRoles.push(assertion.semantic_role);
      if (assertion.source_observation_id && !current.sourceObservationIds.includes(assertion.source_observation_id)) current.sourceObservationIds.push(assertion.source_observation_id);
      if (assertion.signal_id && !current.signalIds.includes(assertion.signal_id)) current.signalIds.push(assertion.signal_id);
      continue;
    }
    groups.set(key, {
      key,
      entityKind: assertion.entity_kind,
      displayValue: assertion.display_value,
      normalizedValue,
      occurrenceCount: 1,
      assertionIds: [assertion.id],
      semanticRoles: assertion.semantic_role ? [assertion.semantic_role] : [],
      sourceObservationIds: assertion.source_observation_id ? [assertion.source_observation_id] : [],
      signalIds: assertion.signal_id ? [assertion.signal_id] : [],
    });
  }

  return [...groups.values()].sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.key.localeCompare(b.key));
}

function compact(value: string) {
  return normalizeEntityLookup(value).replace(/[^a-z0-9]+/g, "");
}

function tokens(value: string) {
  return new Set(normalizeEntityLookup(value).split(/[^a-z0-9]+/).filter(Boolean));
}

function candidateScore(observed: string, candidate: string) {
  const a = normalizeEntityLookup(observed);
  const b = normalizeEntityLookup(candidate);
  if (a === b) return 100;
  const ca = compact(a);
  const cb = compact(b);
  if (ca && ca === cb) return 80;
  const at = tokens(a);
  const bt = tokens(b);
  let overlap = 0;
  for (const token of at) if (bt.has(token)) overlap += 1;
  const union = new Set([...at, ...bt]).size || 1;
  const tokenScore = Math.round((overlap / union) * 50);
  const containment = ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca)) ? 20 : 0;
  return tokenScore + containment;
}

export function shortlistEntityCandidates(group: EntityAssertionGroup, entities: EntityRow[], limit = 12) {
  return entities
    .filter((entity) => entity.entity_kind === group.entityKind && entity.status !== "ARCHIVED")
    .map((entity) => ({
      id: entity.id,
      canonicalName: entity.canonical_name,
      canonicalNormalized: entity.canonical_normalized,
      score: candidateScore(group.displayValue, entity.canonical_name),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.canonicalName.localeCompare(b.canonicalName))
    .slice(0, Math.min(Math.max(limit, 1), 20));
}
