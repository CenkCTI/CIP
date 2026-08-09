import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEntityAiMessages, parseEntityAiResponse, type EntityAiGroup } from "@/lib/techint/entities/ai-resolver";
import { groupUnresolvedAssertions, shortlistEntityCandidates } from "@/lib/techint/entities/grouping";

const suggestRoute = readFileSync("src/app/api/techint/entities/suggest/route.ts", "utf8");
const resolveRoute = readFileSync("src/app/api/techint/entities/resolve-group/route.ts", "utf8");
const autoResolveRoute = readFileSync("src/app/api/techint/entities/auto-resolve-ai/route.ts", "utf8");
const workspace = readFileSync("src/app/techint/entities/resolution-workspace.tsx", "utf8");
const byokPanel = readFileSync("src/components/ai/byok-connection-panel.tsx", "utf8");

describe("Phase 2.3D grouped review", () => {
  it("collapses repeated exact unresolved labels into one group", () => {
    const groups = groupUnresolvedAssertions([
      { id: "a", entity_kind: "VENDOR", display_value: "Microsoft", normalized_value: "Microsoft", semantic_role: "AFFECTS", source_observation_id: "o1", signal_id: "s1" },
      { id: "b", entity_kind: "VENDOR", display_value: " microsoft ", normalized_value: " microsoft ", semantic_role: "AFFECTS", source_observation_id: "o2", signal_id: "s2" },
      { id: "c", entity_kind: "PRODUCT", display_value: "Microsoft", normalized_value: "Microsoft", semantic_role: "AFFECTS", source_observation_id: "o3", signal_id: "s3" },
    ], []);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.entityKind === "VENDOR")?.occurrenceCount).toBe(2);
  });

  it("does not return already resolved or dismissed assertions to normal review", () => {
    const groups = groupUnresolvedAssertions([
      { id: "a", entity_kind: "MALWARE", display_value: "Lumma", normalized_value: "Lumma" },
      { id: "b", entity_kind: "MALWARE", display_value: "Lumma", normalized_value: "Lumma" },
      { id: "c", entity_kind: "MALWARE", display_value: "Lumma", normalized_value: "Lumma" },
    ], [
      { assertion_id: "a", status: "RESOLVED" },
      { assertion_id: "b", status: "DISMISSED" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].assertionIds).toEqual(["c"]);
  });

  it("uses fuzzy-looking forms only to shortlist positive candidates, never as an automatic deterministic equality", () => {
    const group = groupUnresolvedAssertions([
      { id: "a", entity_kind: "MALWARE", display_value: "LummaStealer", normalized_value: "LummaStealer" },
    ], [])[0];
    const candidates = shortlistEntityCandidates(group, [
      { id: "00000000-0000-4000-8000-000000000001", entity_kind: "MALWARE", canonical_name: "Lumma Stealer", canonical_normalized: "lumma stealer", status: "ACTIVE" },
      { id: "00000000-0000-4000-8000-000000000002", entity_kind: "MALWARE", canonical_name: "Agent Tesla", canonical_normalized: "agent tesla", status: "ACTIVE" },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].canonicalName).toBe("Lumma Stealer");
    expect(candidates[0].score).toBeGreaterThan(0);
  });
});

describe("Phase 2.3D BYOK suggestion contract", () => {
  const groups: EntityAiGroup[] = [{
    entityKind: "MALWARE",
    displayValue: "LummaStealer",
    normalizedValue: "lummastealer",
    occurrenceCount: 83,
    sourceSystems: ["threatfox", "malwarebazaar"],
    semanticRoles: ["USES"],
    sampleSignalTitles: ["Observed malware metadata"],
    candidates: [{ id: "00000000-0000-4000-8000-000000000001", canonicalName: "Lumma Stealer" }],
  }];

  it("accepts a match only when the model returns a server-supplied candidate ID", () => {
    const result = parseEntityAiResponse(JSON.stringify({ suggestions: [{
      groupIndex: 0,
      decision: "MATCH_EXISTING",
      candidateEntityId: "00000000-0000-4000-8000-000000000001",
      proposedCanonicalName: null,
      confidence: "HIGH",
      rationale: "The observed label is consistent with the supplied canonical candidate.",
    }] }), groups);
    expect(result[0].decision).toBe("MATCH_EXISTING");
    expect(result[0].candidateEntityId).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("downgrades a hallucinated candidate ID to UNSURE", () => {
    const result = parseEntityAiResponse(JSON.stringify({ suggestions: [{
      groupIndex: 0,
      decision: "MATCH_EXISTING",
      candidateEntityId: "00000000-0000-4000-8000-000000000099",
      proposedCanonicalName: null,
      confidence: "HIGH",
      rationale: "Invented candidate.",
    }] }), groups);
    expect(result[0].decision).toBe("UNSURE");
    expect(result[0].candidateEntityId).toBeNull();
  });

  it("treats source strings as untrusted content and explicitly denies model-side writes", () => {
    const messages = buildEntityAiMessages(groups);
    expect(messages[0].content).toContain("cannot write data");
    expect(messages[0].content).toContain("untrusted quoted data");
    expect(messages[0].content).toContain("Never invent a candidate ID");
    expect(messages[1].content).toContain("MATCH_EXISTING may use only an ID present");
  });
});

describe("Phase 2.3D BYOK implementation boundary", () => {
  it("reuses the encrypted user-bound BYOK cookie and existing chat client", () => {
    expect(suggestRoute).toContain("BYOK_COOKIE");
    expect(suggestRoute).toContain("decryptCredential");
    expect(suggestRoute).toContain("byokChat");
    expect(suggestRoute).toContain('kind: "user"');
    expect(suggestRoute).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the suggestion-only endpoint non-mutating", () => {
    expect(suggestRoute).not.toMatch(/createTechnicalEntity|linkTechnicalEntity|addTechnicalEntityAlias|reconcileTechnicalEntitiesWorkflow|aiResolveTechnicalEntityAssertionWorkflow/);
    expect(suggestRoute).toContain("AI suggestions are non-authoritative");
  });

  it("server-checks create suggestions against existing canonical names before presenting a new-entity action", () => {
    expect(suggestRoute).toContain("exactExisting.length === 1");
    expect(suggestRoute).toContain('decision: "MATCH_EXISTING"');
    expect(suggestRoute).toContain("multiple existing entities");
  });

  it("preserves explicit analyst confirmation and separates guarded AI auto-resolution", () => {
    expect(resolveRoute).toContain("linkTechnicalEntityAssertionWorkflow");
    expect(resolveRoute).toContain("createTechnicalEntityFromAssertionWorkflow");
    expect(resolveRoute).toContain("NEEDS_REVIEW");
    expect(workspace).toContain("Confirm &amp; teach exact alias");
    expect(workspace).toContain("AI confidence alone never authorizes a write");
    expect(workspace).toContain("AI never creates an entity or teaches an alias automatically");
    expect(autoResolveRoute).toContain("evaluateAiAutoResolution");
    expect(autoResolveRoute).toContain("aiResolveTechnicalEntityAssertionWorkflow");
  });

  it("defaults the TechINT BYOK panel to NVIDIA NIM without removing other providers", () => {
    expect(workspace).toContain('defaultProviderId="nvidia_nim"');
    expect(byokPanel).toContain("nvidia_nim");
    expect(byokPanel).toContain("openai");
    expect(byokPanel).toContain("openrouter");
    expect(byokPanel).toContain("groq");
  });
});
