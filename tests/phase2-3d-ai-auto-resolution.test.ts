import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateAiAutoResolution,
  isGenericEntityLabel,
  isSafeCanonicalBootstrapName,
} from "@/lib/techint/entities/auto-resolution";
import type { EntityAiSuggestion } from "@/lib/techint/entities/ai-resolver";
import type { EntityCandidate } from "@/lib/techint/entities/grouping";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";

const route = readFileSync("src/app/api/techint/entities/auto-resolve-ai/route.ts", "utf8");
const migration038 = readFileSync("supabase/migrations/202608090038_phase2_3d_ai_verified_auto_resolution.sql", "utf8");
const migration039 = readFileSync("supabase/migrations/202608090039_phase2_3d_ai_verified_canonical_bootstrap.sql", "utf8");
const workspace = readFileSync("src/app/techint/entities/resolution-workspace.tsx", "utf8");

function suggestion(overrides: Partial<EntityAiSuggestion> = {}): EntityAiSuggestion {
  return {
    groupIndex: 0,
    decision: "MATCH_EXISTING",
    candidateEntityId: "00000000-0000-4000-8000-000000000001",
    proposedCanonicalName: null,
    confidence: "HIGH",
    rationale: "Bounded evidence supports the supplied candidate.",
    ...overrides,
  };
}

function candidate(id = "00000000-0000-4000-8000-000000000001", score = 100): EntityCandidate {
  return { id, canonicalName: "Fortinet", canonicalNormalized: "fortinet", score };
}

function gate(input: {
  kind?: TechnicalEntityKind;
  value?: string;
  titles?: string[];
  ai?: Partial<EntityAiSuggestion>;
  candidates?: EntityCandidate[];
  entityKind?: TechnicalEntityKind;
  entityStatus?: string;
  candidateEntity?: boolean;
}) {
  const kind = input.kind ?? "VENDOR";
  const candidates = input.candidates ?? [candidate()];
  return evaluateAiAutoResolution({
    group: {
      entityKind: kind,
      displayValue: input.value ?? "Fortinet",
      normalizedValue: (input.value ?? "Fortinet").toLowerCase(),
      sampleSignalTitles: input.titles ?? ["Fortinet FortiOS vulnerability"],
    },
    suggestion: suggestion(input.ai),
    candidates,
    candidateEntity: input.candidateEntity === false ? null : {
      id: "00000000-0000-4000-8000-000000000001",
      entityKind: input.entityKind ?? kind,
      status: input.entityStatus ?? "ACTIVE",
    },
  });
}

describe("Phase 2.3D AI auto-resolution safety gates", () => {
  it("allows HIGH + unique strong same-kind existing candidate", () => {
    expect(gate({})).toEqual({
      eligible: true,
      action: "LINK_EXISTING",
      entityId: "00000000-0000-4000-8000-000000000001",
      reason: "SAFE_HIGH_MATCH",
    });
  });

  it("allows a HIGH identity-equivalent CREATE_NEW when no strong candidate exists", () => {
    expect(gate({
      value: "Google",
      candidates: [],
      candidateEntity: false,
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Google", confidence: "HIGH" },
    })).toEqual({ eligible: true, action: "CREATE_NEW", canonicalName: "Google", reason: "SAFE_HIGH_CREATE" });
  });

  it("allows conservative spacing-only canonical bootstrap such as LummaStealer -> Lumma Stealer", () => {
    expect(isSafeCanonicalBootstrapName("LummaStealer", "Lumma Stealer")).toBe(true);
    expect(gate({
      kind: "MALWARE",
      value: "LummaStealer",
      candidates: [],
      candidateEntity: false,
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Lumma Stealer", confidence: "HIGH" },
    })).toMatchObject({ eligible: true, action: "CREATE_NEW", reason: "SAFE_HIGH_CREATE" });
  });

  it("never auto-resolves or auto-creates MEDIUM or LOW confidence", () => {
    expect(gate({ ai: { confidence: "MEDIUM" } })).toMatchObject({ eligible: false, reason: "NOT_HIGH_CONFIDENCE" });
    expect(gate({
      candidates: [],
      candidateEntity: false,
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Google", confidence: "LOW" },
    })).toMatchObject({ eligible: false, reason: "NOT_HIGH_CONFIDENCE" });
  });

  it("fails closed when multiple strong candidates compete", () => {
    expect(gate({ candidates: [candidate(), candidate("00000000-0000-4000-8000-000000000002", 80)] })).toMatchObject({ eligible: false, reason: "COMPETING_CANDIDATES" });
  });

  it("will not CREATE_NEW while a strong existing candidate is available", () => {
    expect(gate({
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Fortinet", confidence: "HIGH" },
    })).toMatchObject({ eligible: false, reason: "EXISTING_CANDIDATE_AVAILABLE" });
  });

  it("rejects hallucinated or out-of-set candidate IDs", () => {
    expect(gate({ ai: { candidateEntityId: "00000000-0000-4000-8000-000000000099" } })).toMatchObject({ eligible: false, reason: "CANDIDATE_NOT_ALLOWED" });
  });

  it("rejects candidate kind mismatch and inactive candidates", () => {
    expect(gate({ entityKind: "MALWARE" })).toMatchObject({ eligible: false, reason: "KIND_MISMATCH" });
    expect(gate({ entityStatus: "ARCHIVED" })).toMatchObject({ eligible: false, reason: "CANDIDATE_INACTIVE" });
  });

  it("rejects CREATE_NEW names that materially change the observed identity", () => {
    expect(isSafeCanonicalBootstrapName("Google", "Alphabet Google Cloud")).toBe(false);
    expect(gate({
      value: "Google",
      candidates: [],
      candidateEntity: false,
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Alphabet Google Cloud", confidence: "HIGH" },
    })).toMatchObject({ eligible: false, reason: "CREATE_NAME_MISMATCH" });
  });

  it("keeps PRODUCT without corroborating parent context in analyst review", () => {
    expect(gate({
      kind: "PRODUCT",
      value: "FortiOS",
      titles: ["FortiOS vulnerability"],
      candidates: [{ ...candidate(), canonicalName: "FortiOS", canonicalNormalized: "fortios" }],
      entityKind: "PRODUCT",
    })).toMatchObject({ eligible: false, reason: "CONTEXT_INSUFFICIENT" });
  });

  it("keeps conflicting PRODUCT Core context in analyst review", () => {
    expect(gate({
      kind: "PRODUCT",
      value: "Core",
      titles: ["Known exploited vulnerability: WordPress Core SQL Injection", "Known exploited vulnerability: Drupal Core SQL Injection"],
      candidates: [{ ...candidate(), canonicalName: "Core", canonicalNormalized: "core" }],
      entityKind: "PRODUCT",
    })).toMatchObject({ eligible: false, reason: "CONTEXT_CONFLICT" });
  });

  it("allows PRODUCT CREATE_NEW only with one corroborating parent context", () => {
    expect(gate({
      kind: "PRODUCT",
      value: "FortiOS",
      titles: ["Fortinet FortiOS remote code execution"],
      candidates: [],
      candidateEntity: false,
      ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "FortiOS", confidence: "HIGH" },
    })).toMatchObject({ eligible: true, action: "CREATE_NEW", reason: "SAFE_HIGH_CREATE" });
  });

  it("recognizes bounded generic labels and never auto-resolves or creates them", () => {
    expect(isGenericEntityLabel("Multiple Products")).toBe(true);
    expect(gate({ kind: "PRODUCT", value: "Multiple Products", entityKind: "PRODUCT" })).toMatchObject({ eligible: false, reason: "GENERIC_LABEL" });
  });

  it("keeps deterministic identities out of the AI write path", () => {
    expect(gate({ kind: "CVE", value: "CVE-2026-12345", entityKind: "CVE" })).toMatchObject({ eligible: false, reason: "DETERMINISTIC_KIND" });
  });

  it("does not broadly auto-resolve threat actors or campaigns", () => {
    expect(gate({ kind: "THREAT_ACTOR", entityKind: "THREAT_ACTOR" })).toMatchObject({ eligible: false, reason: "KIND_NOT_ENABLED" });
    expect(gate({ kind: "CAMPAIGN", entityKind: "CAMPAIGN" })).toMatchObject({ eligible: false, reason: "KIND_NOT_ENABLED" });
  });
});

describe("Phase 2.3D AI auto-resolution trust boundary", () => {
  it("uses separate narrow trusted workflows for linking and canonical bootstrap", () => {
    expect(route).toContain("requireUser");
    expect(route).toContain("aiResolveTechnicalEntityAssertionWorkflow");
    expect(route).toContain("aiCreateTechnicalEntityFromAssertionWorkflow");
    expect(route).toContain("evaluateAiAutoResolution");
    expect(route).not.toContain("createTechnicalEntityFromAssertionWorkflow");
    expect(route).not.toContain("addTechnicalEntityAliasWorkflow");
  });

  it("never teaches an alias during automatic linking or bootstrap", () => {
    expect(route).toContain("aliasTaught: false");
    expect(migration038).not.toMatch(/insert into public\.technical_entity_aliases/i);
    expect(migration039).not.toMatch(/insert into public\.technical_entity_aliases/i);
    expect(migration039).not.toContain("ANALYST_CONFIRMED");
  });

  it("records truthful AI_VERIFIED entity origin, resolution basis and dedicated audit actions", () => {
    expect(migration038).toContain("AI_VERIFIED");
    expect(migration038).toContain("ASSERTION_AI_AUTO_RESOLVED");
    expect(migration039).toContain("technical_entity_origin add value if not exists 'AI_VERIFIED'");
    expect(migration039).toContain("ENTITY_AI_AUTO_CREATED");
    expect(migration039).toContain("'AI_VERIFIED','ACTIVE'");
  });

  it("keeps canonical bootstrap owner-scoped, duplicate-safe and service-role-only", () => {
    expect(migration039).toContain("where owner_id=p_actor and id=p_assertion_id");
    expect(migration039).toContain("pg_advisory_xact_lock");
    expect(migration039).toContain("AI_CREATE_EXISTING_ENTITY_CONFLICT");
    expect(migration039).toContain("from public,anon,authenticated");
    expect(migration039).toContain("to service_role");
  });

  it("stores bounded provider/model/confidence metadata but no secret or raw prompt", () => {
    const migrations = `${migration038}\n${migration039}`;
    expect(migrations).toContain("'provider'");
    expect(migrations).toContain("'model'");
    expect(migrations).toContain("'confidence','HIGH'");
    expect(migrations).not.toMatch(/api[_ -]?key/i);
    expect(migrations).not.toMatch(/raw[_ -]?prompt|entire[_ -]?prompt/i);
  });

  it("does not mutate source assertions or analytical/profile/priority state", () => {
    const implementation = `${route}\n${migration038}\n${migration039}`;
    expect(implementation).not.toMatch(/update public\.technical_signal_entity_assertions/i);
    expect(implementation).not.toMatch(/insert into public\.(threat_actors|malware|campaigns|cves|indicators|mitre_techniques|intel_profile_items)/i);
    expect(implementation).not.toMatch(/global_priority|profile_match|attribution|graph_relationship/i);
  });

  it("keeps compact cases expandable while exposing AI confidence and decision buttons", () => {
    expect(workspace).toContain("aria-expanded={expanded}");
    expect(workspace).toContain("Show case details");
    expect(workspace).toContain("AI {suggestion.confidence}");
    expect(workspace).toContain("Create &amp; resolve");
    expect(workspace).toContain("Create &amp; teach exact alias");
    expect(workspace).toContain("Resolve + teach alias");
  });

  it("retains NVIDIA NIM as the default BYOK provider", () => {
    expect(workspace).toContain('defaultProviderId="nvidia_nim"');
  });
});
