import { normalizeIndicatorValue, validateIndicator, type IndicatorType } from "@/lib/cti/indicators";
import { attackCanonicalKey, indicatorCanonicalKey, normalizeCve, vulnerabilityCanonicalKey } from "@/lib/techint/signals/canonical-key";
import type { TechnicalEntityKind } from "./types";

export function normalizeEntityLookup(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized || normalized.length > 500 || /[\u0000-\u001f]/.test(normalized)) {
    throw new Error("Invalid entity value.");
  }
  return normalized;
}

export type DeterministicEntityIdentity = {
  key: string;
  canonicalName: string;
  canonicalNormalized: string;
  indicatorType: IndicatorType | null;
};

export function deterministicEntityIdentity(
  kind: TechnicalEntityKind,
  value: string,
  indicatorType?: IndicatorType | null,
): DeterministicEntityIdentity | null {
  if (kind === "CVE") {
    const canonical = normalizeCve(value);
    return {
      key: vulnerabilityCanonicalKey(canonical),
      canonicalName: canonical,
      canonicalNormalized: canonical,
      indicatorType: null,
    };
  }

  if (kind === "ATTACK_TECHNIQUE") {
    const key = attackCanonicalKey(value);
    const canonical = key.slice("attack:".length);
    return { key, canonicalName: canonical, canonicalNormalized: canonical, indicatorType: null };
  }

  if (kind === "INDICATOR") {
    if (!indicatorType || !["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL"].includes(indicatorType)) {
      throw new Error("Indicator subtype is required.");
    }
    const canonical = normalizeIndicatorValue(value, indicatorType);
    const validationError = validateIndicator(canonical, indicatorType);
    if (validationError) throw new Error(validationError);
    return {
      key: indicatorCanonicalKey(indicatorType, canonical),
      canonicalName: canonical,
      canonicalNormalized: canonical,
      indicatorType,
    };
  }

  return null;
}
