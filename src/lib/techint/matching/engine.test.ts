import { describe, expect, it } from "vitest";
import { evaluateProfileMatch } from "./engine";

describe("Phase 2.3E Profile Matching", () => {
  it("keeps unresolved Splunk source identity visible as a provisional match", () => {
    const result = evaluateProfileMatch({
      title: "Splunk Enterprise Missing Authentication for Critical Function Vulnerability",
      profileItems: [{ id: "profile-vendor", kind: "VENDOR", normalizedValue: "splunk" }],
      assertions: [
        { id: "vendor", kind: "VENDOR", normalizedValue: "splunk", resolutionStatus: "NEEDS_REVIEW" },
        { id: "product", kind: "PRODUCT", normalizedValue: "enterprise", resolutionStatus: "NEEDS_REVIEW" },
      ],
    });

    expect(result.matched).toBe(true);
    expect(result.relevance).toBe("HIGH");
    expect(result.matchQuality).toBe("PROVISIONAL");
    expect(result.reasonCodes).toContain("DIRECT_SOURCE:profile-vendor");
    expect(result.pendingAssertionIds).toEqual(expect.arrayContaining(["vendor", "product"]));
  });

  it("upgrades the same product scope to confirmed after canonical resolution", () => {
    const profileItems = [{ id: "profile-product", kind: "PRODUCT", normalizedValue: "splunk enterprise" }];
    const before = evaluateProfileMatch({
      title: "Splunk Enterprise Missing Authentication for Critical Function Vulnerability",
      profileItems,
      assertions: [
        { id: "vendor", kind: "VENDOR", normalizedValue: "splunk", resolutionStatus: "NEEDS_REVIEW" },
        { id: "product", kind: "PRODUCT", normalizedValue: "enterprise", resolutionStatus: "NEEDS_REVIEW" },
      ],
    });
    const after = evaluateProfileMatch({
      title: "Splunk Enterprise Missing Authentication for Critical Function Vulnerability",
      profileItems,
      assertions: [
        { id: "vendor", kind: "VENDOR", normalizedValue: "splunk", resolutionStatus: "NEEDS_REVIEW" },
        {
          id: "product",
          kind: "PRODUCT",
          normalizedValue: "enterprise",
          resolutionStatus: "RESOLVED",
          resolvedEntityId: "entity-splunk-enterprise",
          resolvedCanonicalNormalized: "splunk enterprise",
        },
      ],
    });

    expect(before.matchQuality).toBe("PROVISIONAL");
    expect(after.matchQuality).toBe("CONFIRMED");
    expect(after.matchedEntityIds).toContain("entity-splunk-enterprise");
  });

  it("creates a bounded contextual match from watched sector and country", () => {
    const result = evaluateProfileMatch({
      title: "Energy-sector exploitation observed in Poland",
      profileItems: [
        { id: "sector", kind: "SECTOR", normalizedValue: "energy" },
        { id: "country", kind: "COUNTRY", normalizedValue: "poland", semanticRole: "TARGET" },
      ],
      assertions: [
        { id: "sector-a", kind: "SECTOR", normalizedValue: "energy", semanticRole: "TARGETS" },
        { id: "country-a", kind: "COUNTRY", normalizedValue: "poland", semanticRole: "TARGETS" },
      ],
    });

    expect(result.matched).toBe(true);
    expect(result.matchQuality).toBe("CONTEXTUAL");
    expect(result.relevance).toBe("HIGH");
  });
});
