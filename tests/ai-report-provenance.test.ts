import { describe, expect, it } from "vitest";
import { buildAllowedReportRefs, validateReportDraftProvenance } from "@/lib/ai/provenance";
import { toTiptapDoc, reportDraftSchema } from "@/lib/ai/workflows";
import { workflowContractText } from "@/lib/ai/contracts";

const authorized = "49429515-bc04-4539-ae53-69f0b47157cb";
const typo = "49429615-bc04-4539-ae53-69f0b47157cb";

describe("AI report provenance validation", () => {
  const allowed = buildAllowedReportRefs({ research_notes: [{ id: authorized, title: "Source" }] });
  it("rejects the exact live hallucinated UUID typo", () => {
    const draft = { sections: [{ source_refs: [{ kind: "research_note", id: typo }] }] };
    expect(validateReportDraftProvenance(draft, allowed)).toMatchObject({ ok: false });
  });
  it("rejects unsupported source kinds", () => {
    const draft = { sections: [{ source_refs: [{ kind: "note", id: authorized }] }] };
    expect(validateReportDraftProvenance(draft, allowed)).toMatchObject({ ok: false });
  });
  it("accepts valid canonical report references", () => {
    const draft = { sections: [{ source_refs: [{ kind: "research_note", id: authorized }] }] };
    expect(validateReportDraftProvenance(draft, allowed)).toEqual({ ok: true, invalid: [] });
  });
  it("persists caveats into TipTap output", () => {
    const draft = reportDraftSchema.parse({ title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "Finding", paragraphs: ["Body"], source_refs: [{ kind: "research_note", id: authorized }] }], caveats: ["First caveat", "Second caveat"], disclaimer: "AI-generated; review required." });
    expect(JSON.stringify(toTiptapDoc(draft))).toContain("Caveats");
    expect(JSON.stringify(toTiptapDoc(draft))).toContain("First caveat");
    expect(JSON.stringify(toTiptapDoc(draft))).toContain("Second caveat");
  });
  it("report prompt prohibits unsupported timestamps and facts", () => {
    const prompt = workflowContractText("generate_report_draft");
    expect(prompt).toContain("Do not invent timestamps");
    expect(prompt).toContain("source_ref");
    expect(prompt).toContain("copied exactly");
  });
});
