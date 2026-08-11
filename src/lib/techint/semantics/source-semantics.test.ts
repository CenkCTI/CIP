import { describe, expect, it } from "vitest";
import {
  observationSemanticsForSourceKey,
  observationSemanticsForSourceSystem,
  sourceSemanticMetadataForKey,
} from "./source-semantics";

const expected = [
  ["CISA_KEV", "EXPLOITED_VULNERABILITY_CATALOG", "PUBLISHED", "KNOWN_EXPLOITED_VULNERABILITY"],
  ["NVD_CVE", "VULNERABILITY_DATABASE", "PUBLISHED", "VULNERABILITY_RECORD"],
  ["FIRST_EPSS", "EXPLOIT_PROBABILITY", "SCORED", "EXPLOIT_PROBABILITY_SCORE"],
  ["THREATFOX", "IOC_SHARING", "REPORTED", "IOC_REPORT"],
  ["MALWAREBAZAAR", "MALWARE_SAMPLE_REPOSITORY", "PUBLISHED", "MALWARE_SAMPLE_RECORD"],
] as const;

describe("Phase 2.3F-C source semantics", () => {
  it.each(expected)("classifies %s conservatively", (key, sourceClass, basis, kind) => {
    const semantics = observationSemanticsForSourceKey(key);
    expect(semantics).toMatchObject({
      sourceClass,
      observationBasis: basis,
      semanticKind: kind,
      semanticsVersion: "2.3F-C-v1",
      classificationBasis: "DETERMINISTIC_SOURCE_MAPPING",
    });
  });

  it("keeps EPSS separate from observed exploitation", () => {
    const semantics = observationSemanticsForSourceKey("FIRST_EPSS");
    const metadata = sourceSemanticMetadataForKey("FIRST_EPSS");
    expect(semantics.observationBasis).toBe("SCORED");
    expect(semantics.semanticKind).toBe("EXPLOIT_PROBABILITY_SCORE");
    expect(metadata.doesNotRepresent.toLowerCase()).toContain("observed exploitation");
  });

  it("treats ThreatFox as IOC sharing/reporting rather than attack telemetry", () => {
    const semantics = observationSemanticsForSourceSystem("threatfox");
    const metadata = sourceSemanticMetadataForKey("THREATFOX");
    expect(semantics).toMatchObject({ sourceClass: "IOC_SHARING", observationBasis: "REPORTED", semanticKind: "IOC_REPORT" });
    expect(metadata.doesNotRepresent.toLowerCase()).toContain("global attack volume");
  });

  it("treats MalwareBazaar as published sample repository metadata", () => {
    const semantics = observationSemanticsForSourceSystem("malwarebazaar");
    const metadata = sourceSemanticMetadataForKey("MALWAREBAZAAR");
    expect(semantics).toMatchObject({ sourceClass: "MALWARE_SAMPLE_REPOSITORY", observationBasis: "PUBLISHED", semanticKind: "MALWARE_SAMPLE_RECORD" });
    expect(metadata.doesNotRepresent.toLowerCase()).toContain("victim infection");
  });

  it("preserves uncertainty for unknown historical sources", () => {
    expect(observationSemanticsForSourceSystem("legacy-provider-x")).toEqual({
      sourceClass: "UNKNOWN",
      observationBasis: "UNKNOWN",
      semanticKind: "UNKNOWN",
      semanticsVersion: "2.3F-C-v1",
      classificationBasis: "UNKNOWN",
    });
  });
});
