import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deterministicEntityIdentity, normalizeEntityLookup } from "@/lib/techint/entities/normalization";

const migration = readFileSync("supabase/migrations/202608080037_phase2_3d_taxonomy_entity_normalization.sql", "utf8");
const trustedClient = readFileSync("src/lib/techint/entities/trusted-client.ts", "utf8");
const actions = readFileSync("src/app/techint/entities/actions.ts", "utf8");

describe("Phase 2.3D deterministic normalization", () => {
  it("normalizes CVE and ATT&CK identity deterministically", () => {
    expect(deterministicEntityIdentity("CVE", "cve-2026-12345")?.key).toBe("cve:CVE-2026-12345");
    expect(deterministicEntityIdentity("ATTACK_TECHNIQUE", "t1059.001")?.key).toBe("attack:T1059.001");
  });

  it("reuses Indicator canonicalization including URL path/query case", () => {
    const result = deterministicEntityIdentity("INDICATOR", "https://Example.COM/Case/Path?Q=Value", "URL");
    expect(result?.key).toContain("indicator:URL:");
    expect(result?.canonicalNormalized).toContain("/Case/Path?Q=Value");
  });

  it("rejects invalid deterministic values", () => {
    expect(() => deterministicEntityIdentity("CVE", "not-a-cve")).toThrow();
    expect(() => deterministicEntityIdentity("ATTACK_TECHNIQUE", "T12")).toThrow();
    expect(() => deterministicEntityIdentity("INDICATOR", "not a domain", "DOMAIN")).toThrow();
  });
});

describe("Phase 2.3D conservative alias lookup", () => {
  it("only folds case and whitespace", () => {
    expect(normalizeEntityLookup("  Lumma   Stealer  ")).toBe("lumma stealer");
    expect(normalizeEntityLookup("Lumma-Stealer")).toBe("lumma-stealer");
    expect(normalizeEntityLookup("BlackBasta")).toBe("blackbasta");
  });

  it("does not create fuzzy or punctuation-stripped equality", () => {
    expect(normalizeEntityLookup("Lumma Stealer")).not.toBe(normalizeEntityLookup("Lumma-Stealer"));
    expect(normalizeEntityLookup("Lumma Stealer")).not.toBe(normalizeEntityLookup("LummaStealr"));
    expect(normalizeEntityLookup("APT 28")).not.toBe(normalizeEntityLookup("APT28"));
    expect(normalizeEntityLookup("Black Basta")).not.toBe(normalizeEntityLookup("BlackBasta"));
  });
});

describe("Phase 2.3D trust boundaries", () => {
  it("keeps source assertions append-only and resolution separate", () => {
    expect(migration).toContain("technical_signal_entity_assertions");
    expect(migration).toContain("technical_entity_assertion_resolutions");
    expect(migration).not.toMatch(/update public\.technical_signal_entity_assertions/i);
    expect(migration).not.toMatch(/delete from public\.technical_signal_entity_assertions/i);
  });

  it("does not add fuzzy, AI, provider, profile-match, or analytical mutation code", () => {
    expect(`${migration}\n${trustedClient}\n${actions}`).not.toMatch(/levenshtein|similarity\(|openai|ollama|fetch\(|global_priority|profile_match/i);
    expect(migration).not.toMatch(/insert into public\.(threat_actors|malware|campaigns|cves|indicators|mitre_techniques|intel_profile_items)/i);
    expect(migration).not.toMatch(/update public\.(threat_actors|malware|campaigns|cves|indicators|mitre_techniques|intel_profile_items)/i);
  });

  it("keeps normal browser actions from forging authoritative aliases", () => {
    expect(migration).toContain("AUTHORITATIVE_SOURCE");
    expect(migration).toContain("ANALYST_CONFIRMED");
    expect(actions).not.toContain("AUTHORITATIVE_SOURCE");
  });

  it("requires explicit remember-alias choice", () => {
    expect(actions).toContain('checked(form, "rememberAlias")');
    expect(actions).toContain('form.get(name) === "on"');
    expect(actions).toContain("p_remember_alias");
  });

  it("uses a service-role-only trusted client", () => {
    expect(trustedClient).toContain('import "server-only"');
    expect(trustedClient).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(trustedClient).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });
});
