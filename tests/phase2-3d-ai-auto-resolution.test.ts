import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateAiAutoResolution, isGenericEntityLabel } from "@/lib/techint/entities/auto-resolution";
import type { EntityAiSuggestion } from "@/lib/techint/entities/ai-resolver";
import type { EntityCandidate } from "@/lib/techint/entities/grouping";
import type { TechnicalEntityKind } from "@/lib/techint/entities/types";

const route = readFileSync("src/app/api/techint/entities/auto-resolve-ai/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/202608090038_phase2_3d_ai_verified_auto_resolution.sql", "utf8");
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
}) {
  const kind = input.kind ?? "VENDOR";
  return evaluateAiAutoResolution({
    group: {
      entityKind: kind,
      displayValue: input.value ?? "Fortinet",
      normalizedValue: (input.value ?? "Fortinet").toLowerCase(),
      sampleSignalTitles: input.titles ?? ["Fortinet FortiOS vulnerability"],
    },
    suggestion: suggestion(input.ai),
    candidates: input.candidates ?? [candidate()],
    candidateEntity: {
      id: "00000000-0000-4000-8000-000000000001",
      entityKind: input.entityKind ?? kind,
      status: input.entityStatus ?? "ACTIVE",
    },
  });
}

describe("Phase 2.3D AI auto-resolution safety gates", () => {
  it("allows HIGH + unique strong same-kind existing candidate", () => {
    expect(gate({})).toEqual({ eligible: true, entityId: "00000000-0000-4000-8000-000000000001", reason: "SAFE_HIGH_MATCH" });
  });

  it("never auto-resolves MEDIUM or LOW confidence", () => {
    expect(gate({ ai: { confidence: "MEDIUM" } })).toMatchObject({ eligible: false, reason: "NOT_HIGH_CONFIDENCE" });
    expect(gate({ ai: { confidence: "LOW" } })).toMatchObject({ eligible: false, reason: "NOT_HIGH_CONFIDENCE" });
  });

  it("fails closed when multiple strong candidates compete", () => {
    expect(gate({ candidates: [candidate(), candidate("00000000-0000-4000-8000-000000000002", 80)] })).toMatchObject({ eligible: false, reason: "COMPETING_CANDIDATES" });
  });

  it("rejects hallucinated or out-of-set candidate IDs", () => {
    expect(gate({ ai: { candidateEntityId: "00000000-0000-4000-8000-000000000099" } })).toMatchObject({ eligible: false, reason: "CANDIDATE_NOT_ALLOWED" });
  });

  it("rejects candidate kind mismatch and inactive candidates", () => {
    expect(gate({ entityKind: "MALWARE" })).toMatchObject({ eligible: false, reason: "KIND_MISMATCH" });
    expect(gate({ entityStatus: "ARCHIVED" })).toMatchObject({ eligible: false, reason: "CANDIDATE_INACTIVE" });
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

  it("recognizes bounded generic labels and never auto-resolves them", () => {
    expect(isGenericEntityLabel("Multiple Products")).toBe(true);
    expect(gate({ kind: "PRODUCT", value: "Multiple Products", entityKind: "PRODUCT" })).toMatchObject({ eligible: false, reason: "GENERIC_LABEL" });
  });

  it("never auto-creates from a HIGH CREATE_NEW suggestion", () => {
    expect(gate({ ai: { decision: "CREATE_NEW", candidateEntityId: null, proposedCanonicalName: "Fortinet", confidence: "HIGH" } })).toMatchObject({ eligible: false, reason: "NOT_MATCH_EXISTING" });
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
  it("uses a separate authenticated route and narrow trusted workflow", () => {
    expect(route).toContain("requireUser");
    expect(route).toContain("aiResolveTechnicalEntityAssertionWorkflow");
    expect(route).toContain("evaluateAiAutoResolution");
    expect(route).not.toContain("createTechnicalEntityFromAssertionWorkflow");
    expect(route).not.toContain("addTechnicalEntityAliasWorkflow");
  });

  it("never teaches an alias during automatic resolution", () => {
    expect(route).toContain("aliasTaught: false");
    expect(migration).not.toMatch(/insert into public\.technical_entity_aliases/i);
    expect(migration).not.toContain("ANALYST_CONFIRMED");
  });

  it("records truthful AI_VERIFIED basis and dedicated append-only audit action", () => {
    expect(migration).toContain("AI_VERIFIED");
    expect(migration).toContain("ASSERTION_AI_AUTO_RESOLVED");
    expect(migration).toContain("technical_entity_write_audit");
  });

  it("stores bounded provider/model/confidence metadata but no secret or raw prompt", () => {
    expect(migration).toContain("'provider'");
    expect(migration).toContain("'model'");
    expect(migration).toContain("'confidence','HIGH'");
    expect(migration).not.toMatch(/api[_ -]?key/i);
    expect(migration).not.toMatch(/raw[_ -]?prompt|entire[_ -]?prompt/i);
  });

  it("keeps the trusted RPC service-role-only and owner-scoped", () => {
    expect(migration).toContain("where owner_id=p_actor and id=p_assertion_id");
    expect(migration).toContain("where owner_id=p_actor and id=p_entity_id and status='ACTIVE'");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
  });

  it("does not mutate source assertions or analytical/profile/priority state", () => {
    expect(migration).not.toMatch(/update public\.technical_signal_entity_assertions/i);
    expect(`${route}\n${migration}`).not.toMatch(/insert into public\.(threat_actors|malware|campaigns|cves|indicators|mitre_techniques|intel_profile_items)/i);
    expect(`${route}\n${migration}`).not.toMatch(/global_priority|profile_match|attribution|graph_relationship/i);
  });

  it("retains NVIDIA NIM as the default BYOK provider and manual confirmation controls", () => {
    expect(workspace).toContain('defaultProviderId="nvidia_nim"');
    expect(workspace).toContain("Confirm &amp; teach exact alias");
    expect(workspace).toContain("Resolve manually");
  });
});
