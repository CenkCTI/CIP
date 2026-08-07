import { describe, expect, it } from "vitest";
import { mapNvdCve, nvdMappingIssueCode } from "./providers/nvd-cve";

const base = {
  id: "CVE-2099-13001",
  sourceIdentifier: "example@example.test",
  published: "2099-01-01T00:00:00.000Z",
  lastModified: "2099-01-02T00:00:00.000Z",
  vulnStatus: "Analyzed",
  descriptions: [],
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
      expect(nvdMappingIssueCode(error)).toBe("INVALID_NVD_SCHEMA");
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
});
