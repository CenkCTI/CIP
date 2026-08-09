import { normalizeEntityLookup } from "./normalization";

const directResolutionBases = new Set(["ANALYST_LINK", "ANALYST_CREATED", "AI_VERIFIED"]);
const deterministicKinds = new Set(["CVE", "INDICATOR", "ATTACK_TECHNIQUE"]);

export type AliasRecommendation = {
  entityId: string;
  entityKind: string;
  canonicalName: string;
  displayValue: string;
  normalizedValue: string;
  observationCount: number;
  sourceSystems: string[];
  aiVerifiedCount: number;
  analystConfirmedCount: number;
  latestResolvedAt: string | null;
};

type ResolutionRow = {
  assertion_id?: unknown;
  entity_kind?: unknown;
  entity_id?: unknown;
  status?: unknown;
  basis?: unknown;
  resolved_at?: unknown;
};

type AssertionRow = {
  id?: unknown;
  entity_kind?: unknown;
  display_value?: unknown;
  normalized_value?: unknown;
  source_observation_id?: unknown;
};

type EntityRow = {
  id?: unknown;
  entity_kind?: unknown;
  canonical_name?: unknown;
  status?: unknown;
};

type AliasRow = {
  entity_kind?: unknown;
  normalized_value?: unknown;
  display_value?: unknown;
  status?: unknown;
};

type ObservationRow = {
  id?: unknown;
  source_system?: unknown;
};

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}

function safeNormalize(value: unknown) {
  try {
    return normalizeEntityLookup(stringValue(value));
  } catch {
    return null;
  }
}

export function buildAliasRecommendations(input: {
  resolutions: ResolutionRow[];
  assertions: AssertionRow[];
  entities: EntityRow[];
  aliases: AliasRow[];
  observations: ObservationRow[];
  minimumObservations?: number;
  limit?: number;
}): AliasRecommendation[] {
  const minimumObservations = Math.min(Math.max(input.minimumObservations ?? 3, 2), 20);
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 50);
  const assertionById = new Map(input.assertions.map((row) => [stringValue(row.id), row]));
  const entityById = new Map(input.entities.map((row) => [stringValue(row.id), row]));
  const observationById = new Map(input.observations.map((row) => [stringValue(row.id), row]));

  const activeAliasKeys = new Set<string>();
  for (const alias of input.aliases) {
    if (stringValue(alias.status) !== "ACTIVE") continue;
    const kind = stringValue(alias.entity_kind);
    const normalized = safeNormalize(alias.normalized_value || alias.display_value);
    if (!kind || !normalized) continue;
    activeAliasKeys.add(`${kind}\u001f${normalized}`);
  }

  const mappingsByLabel = new Map<string, Set<string>>();
  const evidence = new Map<string, {
    entityId: string;
    entityKind: string;
    displayValue: string;
    normalizedValue: string;
    observationIds: Set<string>;
    sourceSystems: Set<string>;
    aiVerifiedCount: number;
    analystConfirmedCount: number;
    latestResolvedAt: string | null;
  }>();

  for (const resolution of input.resolutions) {
    if (stringValue(resolution.status) !== "RESOLVED") continue;
    const basis = stringValue(resolution.basis);
    if (!directResolutionBases.has(basis)) continue;

    const assertion = assertionById.get(stringValue(resolution.assertion_id));
    if (!assertion) continue;
    const kind = stringValue(assertion.entity_kind || resolution.entity_kind);
    if (!kind || deterministicKinds.has(kind)) continue;
    const normalized = safeNormalize(assertion.normalized_value || assertion.display_value);
    if (!normalized) continue;

    const entityId = stringValue(resolution.entity_id);
    const entity = entityById.get(entityId);
    if (!entityId || !entity || stringValue(entity.status) !== "ACTIVE" || stringValue(entity.entity_kind) !== kind) continue;

    const labelKey = `${kind}\u001f${normalized}`;
    const mappedEntities = mappingsByLabel.get(labelKey) ?? new Set<string>();
    mappedEntities.add(entityId);
    mappingsByLabel.set(labelKey, mappedEntities);

    const evidenceKey = `${labelKey}\u001f${entityId}`;
    const current = evidence.get(evidenceKey) ?? {
      entityId,
      entityKind: kind,
      displayValue: stringValue(assertion.display_value || assertion.normalized_value),
      normalizedValue: normalized,
      observationIds: new Set<string>(),
      sourceSystems: new Set<string>(),
      aiVerifiedCount: 0,
      analystConfirmedCount: 0,
      latestResolvedAt: null,
    };

    const observationId = stringValue(assertion.source_observation_id) || stringValue(resolution.assertion_id);
    current.observationIds.add(observationId);
    const sourceSystem = stringValue(observationById.get(stringValue(assertion.source_observation_id))?.source_system);
    if (sourceSystem) current.sourceSystems.add(sourceSystem);
    if (basis === "AI_VERIFIED") current.aiVerifiedCount += 1;
    else current.analystConfirmedCount += 1;
    const resolvedAt = stringValue(resolution.resolved_at) || null;
    if (resolvedAt && (!current.latestResolvedAt || resolvedAt > current.latestResolvedAt)) current.latestResolvedAt = resolvedAt;
    evidence.set(evidenceKey, current);
  }

  const recommendations: AliasRecommendation[] = [];
  for (const current of evidence.values()) {
    const labelKey = `${current.entityKind}\u001f${current.normalizedValue}`;
    if (activeAliasKeys.has(labelKey)) continue;
    if ((mappingsByLabel.get(labelKey)?.size ?? 0) !== 1) continue;
    if (current.observationIds.size < minimumObservations) continue;
    const entity = entityById.get(current.entityId);
    if (!entity) continue;

    recommendations.push({
      entityId: current.entityId,
      entityKind: current.entityKind,
      canonicalName: stringValue(entity.canonical_name),
      displayValue: current.displayValue,
      normalizedValue: current.normalizedValue,
      observationCount: current.observationIds.size,
      sourceSystems: [...current.sourceSystems].sort(),
      aiVerifiedCount: current.aiVerifiedCount,
      analystConfirmedCount: current.analystConfirmedCount,
      latestResolvedAt: current.latestResolvedAt,
    });
  }

  return recommendations
    .sort((left, right) =>
      right.observationCount - left.observationCount
      || right.sourceSystems.length - left.sourceSystems.length
      || left.canonicalName.localeCompare(right.canonicalName),
    )
    .slice(0, limit);
}
