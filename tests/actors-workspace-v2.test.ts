import { readFileSync } from "node:fs";

describe("Actors workspace v2", () => {
  const workspace = readFileSync("src/components/actors/actor-workspace.tsx", "utf8");
  const actions = readFileSync("src/app/projects/[id]/actor-actions.ts", "utf8");

  it("keeps the default Actor workflow focused and attribution-safe", () => {
    expect(workspace).toContain("Add tracked actor");
    expect(workspace).toContain("Reported association");
    expect(workspace).toContain("Attribution judgement remains in the Attribution workspace");
    expect(workspace).not.toContain('name="known_ttps"');
    expect(workspace).not.toContain('name="references"');
  });

  it("uses compact quick links instead of generic relationship checkbox grids", () => {
    expect(workspace).toContain("Advanced links & context");
    expect(workspace).toContain("Quick link");
    expect(workspace).toContain("MITRE Technique");
    expect(workspace).not.toContain("Search relationships");
  });

  it("preserves legacy Actor fields when the simplified profile is edited", () => {
    expect(actions).toContain("known_ttps: context.actor.known_ttps");
    expect(actions).toContain("context.actor.references.join");
    expect(actions).not.toMatch(/campaign_threat_actors/);
  });

  it("enforces same-Investigation ownership before relationship mutation", () => {
    expect(actions).toContain('.eq("project_id", context.projectId)');
    expect(actions).toContain("The selected record is not available in this Investigation.");
    expect(actions).toContain("threat_actor_mitre_techniques");
    expect(actions).toContain("threat_actor_malware");
    expect(actions).toContain("threat_actor_indicators");
  });
});
