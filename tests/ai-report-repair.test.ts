import { describe, expect, it } from "vitest";
import { reportDraftSchema } from "@/lib/ai/workflows";

describe("AI report draft validation", () => {
  it("rejects empty title and empty sections", () => {
    expect(reportDraftSchema.safeParse({ title: "", report_type_suggestion: "TECHNICAL", sections: [], caveats: [], disclaimer: "limited" }).success).toBe(false);
  });
  it("requires non-empty section heading, paragraph, and disclaimer", () => {
    expect(reportDraftSchema.safeParse({ title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "", paragraphs: ["body"], source_refs: [] }], caveats: [], disclaimer: "review" }).success).toBe(false);
    expect(reportDraftSchema.safeParse({ title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "Findings", paragraphs: [""], source_refs: [] }], caveats: [], disclaimer: "review" }).success).toBe(false);
    expect(reportDraftSchema.safeParse({ title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "Findings", paragraphs: ["body"], source_refs: [] }], caveats: [], disclaimer: "" }).success).toBe(false);
  });
  it("accepts a valid canonical report draft", () => {
    expect(reportDraftSchema.safeParse({ title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "Findings", paragraphs: ["body"], source_refs: [] }], caveats: [], disclaimer: "AI-generated; review required." }).success).toBe(true);
  });
});
