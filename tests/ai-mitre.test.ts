import { describe, expect, it } from "vitest";
import { normalizeMitreAttackId, resolveMitreSuggestionsForProject } from "@/lib/ai/mitre";

describe("MITRE ATT&CK approval resolution", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const otherProjectId = "22222222-2222-4222-8222-222222222222";
  const t1059ProjectUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const t1059ForeignUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("resolves T1059.001 to the project-owned MITRE row UUID before linking", () => {
    const [result] = resolveMitreSuggestionsForProject({
      projectId,
      suggestions: [{ technique_id: "t1059.001", technique_name: "PowerShell" }],
      projectMitreRows: [
        { id: t1059ProjectUuid, project_id: projectId, technique_id: "T1059.001", name: "Command and Scripting Interpreter: PowerShell" },
      ],
      existingLinks: [],
    });
    expect(result).toMatchObject({ status: "linked", technique_id: "T1059.001", mitre_technique_id: t1059ProjectUuid });
  });

  it("does not use a same identifier row from another project", () => {
    const [result] = resolveMitreSuggestionsForProject({
      projectId,
      suggestions: [{ technique_id: "T1059.001" }],
      projectMitreRows: [{ id: t1059ForeignUuid, project_id: otherProjectId, technique_id: "T1059.001" }],
      existingLinks: [],
    });
    expect(result.status).toBe("unavailable");
    expect(result.mitre_technique_id).toBeUndefined();
  });

  it("does not let a client-supplied foreign UUID bypass ATT&CK ID resolution", () => {
    expect(() => normalizeMitreAttackId(t1059ForeignUuid)).toThrow();
  });

  it("rejects unknown or hallucinated technique IDs without linking", () => {
    const results = resolveMitreSuggestionsForProject({
      projectId,
      suggestions: [{ technique_id: "T9999.999" }, { technique_id: "not-a-technique" }],
      projectMitreRows: [],
      existingLinks: [],
    });
    expect(results.map((r) => r.status)).toEqual(["unavailable", "invalid"]);
    expect(results.every((r) => !r.mitre_technique_id)).toBe(true);
  });

  it("keeps duplicate links safe", () => {
    const results = resolveMitreSuggestionsForProject({
      projectId,
      suggestions: [{ technique_id: "T1059.001" }, { technique_id: "T1059.001" }],
      projectMitreRows: [{ id: t1059ProjectUuid, project_id: projectId, technique_id: "T1059.001" }],
      existingLinks: [{ mitre_technique_id: t1059ProjectUuid }],
    });
    expect(results.map((r) => r.status)).toEqual(["already_linked", "already_linked"]);
  });
});
