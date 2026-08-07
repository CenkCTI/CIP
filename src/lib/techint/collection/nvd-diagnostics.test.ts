import { describe, expect, it } from "vitest";
import { mapNvdCve, nvdMappingIssueCode } from "./providers/nvd-cve";

const base = {
  id: "CVE-2099-13001",
  sourceIdentifier: "example@example.test",
  published: "2099-01-01T00:00:00.000Z",
  lastModified: "2099-01-02T00:00:00.000Z",
  vulnStatus: "Analyzed",
  descriptions: [{ lang: "en", value: "NVD diagnostic fixture." }],
  metrics: {},
  weaknesses: [],
  references: [],
  configurations: [],
};

describe("NVD safe mapping diagnostics", () => {
  it("distinguishes schema and timestamp failures without exposing raw payloads", () => {
    try {
      mapNvdCve({ ...base, id: "not-a-cve" }, "2099-01-03T00:00:00.000Z");
      throw new Error("fixture unexpectedly mapped");
    } catch (error) {
      expect(nvdMappingIssueCode(error)).toBe("INVALID_NVD_SCHEMA_ID_FORMAT");
    }

    try {
      mapNvdCve({ ...base, published: "not-a-date" }, "2099-01-03T00:00:00.000Z");
      throw new Error("fixture unexpectedly mapped");
    } catch (error) {
      expect(nvdMappingIssueCode(error)).toBe("INVALID_NVD_TIMESTAMP");
    }

    expect(nvdMappingIssueCode(new Error("NVD_NORMALIZED_RECORD_TOO_LARGE"))).toBe("NVD_NORMALIZED_RECORD_TOO_LARGE");
    expect(nvdMappingIssueCode(new Error("sensitive provider detail"))).toBe("INVALID_NVD_RECORD");
  });

  it("accepts schema-valid optional omissions and reads the official weakness description field", () => {
    const mapped = mapNvdCve(
      {
        ...base,
        sourceIdentifier: undefined,
        vulnStatus: undefined,
        weaknesses: [{
          source: "nvd@nist.gov",
          type: "Primary",
          description: [{ lang: "en", value: "CWE-79" }],
        }],
        references: [{
          url: "https://example.test/advisory",
          tags: Array.from({ length: 25 }, (_, index) => `tag-${index}`),
        }],
      },
      "2099-01-03T00:00:00.000Z",
    );

    expect(mapped.signal.facts).toMatchObject({
      sourceIdentifier: null,
      vulnStatus: null,
      cwes: ["CWE-79"],
    });
    expect((mapped.signal.facts as { references: Array<{ tags: string[] }> }).references[0]?.tags).toHaveLength(10);
  });
});
