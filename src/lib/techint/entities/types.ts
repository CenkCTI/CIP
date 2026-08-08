import type { entityKinds } from "@/lib/techint/signals/types";

export const technicalEntityOrigins = ["DETERMINISTIC", "ANALYST"] as const;
export const technicalEntityStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const technicalEntityAliasBases = ["ANALYST_CONFIRMED", "AUTHORITATIVE_SOURCE"] as const;
export const technicalEntityAliasStatuses = ["ACTIVE", "REVOKED"] as const;
export const technicalEntityResolutionStatuses = ["RESOLVED", "NEEDS_REVIEW", "DISMISSED"] as const;
export const technicalEntityResolutionBases = ["DETERMINISTIC_KEY", "CONFIRMED_ALIAS", "AUTHORITATIVE_ALIAS", "ANALYST_LINK", "ANALYST_CREATED"] as const;
export const deterministicEntityKinds = ["CVE", "INDICATOR", "ATTACK_TECHNIQUE"] as const;
export const technicalEntityIndicatorTypes = ["IP", "CIDR", "DOMAIN", "URL", "HASH", "EMAIL"] as const;

export type TechnicalEntityKind = (typeof entityKinds)[number];
export type TechnicalEntityOrigin = (typeof technicalEntityOrigins)[number];
export type TechnicalEntityStatus = (typeof technicalEntityStatuses)[number];
export type TechnicalEntityAliasBasis = (typeof technicalEntityAliasBases)[number];
export type TechnicalEntityResolutionStatus = (typeof technicalEntityResolutionStatuses)[number];
export type TechnicalEntityResolutionBasis = (typeof technicalEntityResolutionBases)[number];

export type ReconcileTechnicalEntitiesResult = {
  processed: number;
  resolved: number;
  needs_review: number;
  entities_created: number;
};
