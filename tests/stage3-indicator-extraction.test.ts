import { describe, expect, it } from "vitest";

import { extractIndicatorCandidatesFromText } from "@/lib/processing/indicator-extraction";

describe("Stage 3 indicator extraction suggestions", () => {
  it("extracts conservative IOC candidates without turning them into facts", () => {
    const rows = extractIndicatorCandidatesFromText(
      "Observed hxxps://update-example[.]com/a and 192.0.2.10. SHA256 44d88612fea8a8f36de82e1278abb02f was also listed.",
    );
    expect(rows.some((row) => row.type === "URL" && row.canonicalValue.includes("update-example.com"))).toBe(true);
    expect(rows.some((row) => row.type === "IP" && row.canonicalValue === "192.0.2.10")).toBe(true);
    expect(rows.some((row) => row.type === "HASH")).toBe(true);
  });

  it("deduplicates normalized candidates", () => {
    const rows = extractIndicatorCandidatesFromText(
      "Example.COM example.com example[.]com",
    );
    expect(rows.filter((row) => row.type === "DOMAIN")).toHaveLength(1);
  });

  it("does not classify ordinary prose as an IOC", () => {
    expect(
      extractIndicatorCandidatesFromText(
        "The report describes targeting activity and broader campaign context.",
      ),
    ).toEqual([]);
  });
});
