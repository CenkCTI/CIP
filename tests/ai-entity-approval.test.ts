import { describe, expect, it } from "vitest";
import { buildEntityApprovalPayload } from "@/lib/ai/entity-approval";

describe("AI entity approval payload builder", () => {
  it("builds canonical Gray Lantern actor insert payload", () => {
    const built = buildEntityApprovalPayload("actors", " Gray Lantern ", " actor description ");
    expect(built.table).toBe("threat_actors");
    expect(built.uniqueCol).toBe("name");
    expect(built.uniqueValue).toBe("Gray Lantern");
    expect({ ...built.payload, project_id: "project-1" }).toEqual({ name: "Gray Lantern", country: null, aliases: [], motivations: [], description: "actor description", known_ttps: "", references: [], project_id: "project-1" });
  });

  it("builds canonical ExampleLoader malware insert payload", () => {
    const built = buildEntityApprovalPayload("malware", " ExampleLoader ", " loader description ");
    expect(built.table).toBe("malware");
    expect(built.uniqueCol).toBe("name");
    expect(built.uniqueValue).toBe("ExampleLoader");
    expect({ ...built.payload, project_id: "project-1" }).toEqual({ name: "ExampleLoader", family: null, hashes: {}, description: "loader description", behavior: "", project_id: "project-1" });
  });

  it("uses parsed trimmed canonical names for actor and malware duplicate checks", () => {
    expect(buildEntityApprovalPayload("actors", " Gray Lantern ").uniqueValue).toBe("Gray Lantern");
    expect(buildEntityApprovalPayload("malware", " ExampleLoader ").uniqueValue).toBe("ExampleLoader");
  });

  it("uses normalized uppercase CVE ID for duplicate lookup", () => {
    const built = buildEntityApprovalPayload("cves", " cve-2025-99999 ");
    expect(built.table).toBe("cves");
    expect(built.uniqueCol).toBe("cve_id");
    expect(built.uniqueValue).toBe("CVE-2025-99999");
    expect((built.payload as { cve_id: string }).cve_id).toBe("CVE-2025-99999");
  });

  it("rejects invalid values before database writes", () => {
    expect(() => buildEntityApprovalPayload("actors", "")).toThrow();
    expect(() => buildEntityApprovalPayload("cves", "not-a-cve")).toThrow();
  });
});
