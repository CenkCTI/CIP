import { describe, expect, it } from "vitest";
import { reportInsertSources } from "@/lib/reports/insert-sources";

describe("report insertion source projections", () => {
  it("never selects unsafe Evidence storage/upload fields", () => {
    const evidence =
      reportInsertSources.find(([table]) => table === "evidence")?.[1] ?? "";
    expect(evidence).toContain("title");
    expect(evidence).toContain("source_url");
    expect(evidence).not.toContain("storage_path");
    expect(evidence).not.toContain("upload_token");
    expect(evidence).not.toContain("signed");
  });
  it("includes kind-specific safe key fields, including Research Note content", () => {
    expect(Object.fromEntries(reportInsertSources)).toMatchObject({
      research_notes: expect.stringContaining("content"),
      indicators: expect.stringContaining("value"),
      cves: expect.stringContaining("cve_id"),
      mitre_techniques: expect.stringContaining("technique_id"),
    });
  });
});
