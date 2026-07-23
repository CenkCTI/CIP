import { describe, expect, it, vi } from "vitest";
import { buildModelFacingReportSource, buildReportSourceAliases } from "@/lib/ai/provenance";
import { canonicalizeReportDraftTokens, runReportDraftWorkflow } from "@/lib/ai/workflows";

const noteId = "49429515-bc04-4539-ae53-69f0b47157cb";
const typoId = "49429615-bc04-4539-ae53-69f0b47157cb";
const evidenceId = "22222222-2222-4222-8222-222222222222";

const modelDraft = (tokens: string[]) => ({
  title: "Report",
  report_type_suggestion: "TECHNICAL" as const,
  sections: [{ heading: "Finding", paragraphs: ["Body"], source_tokens: tokens }],
  caveats: ["Review source limitations."],
  disclaimer: "AI-generated; review required.",
});

describe("AI report source token provenance", () => {
  it("assigns one Research Note deterministic token SRC_001 and omits model-facing UUIDs", () => {
    const source = { research_notes: [{ id: noteId, title: "Note", content: "Body" }] };
    const aliases = buildReportSourceAliases(source);
    expect(aliases).toEqual([{ kind: "research_note", id: noteId, source_token: "SRC_001" }]);
    const modelSource = buildModelFacingReportSource(source, aliases);
    expect(JSON.stringify(modelSource)).toContain("SRC_001");
    expect(JSON.stringify(modelSource)).not.toContain(noteId);
  });

  it("maps SRC_001 back to the exact authorized canonical research_note UUID", () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    expect(canonicalizeReportDraftTokens(modelDraft(["SRC_001"]), aliases).sections[0].source_refs).toEqual([{ kind: "research_note", id: noteId }]);
  });

  it("does not accept the live typo UUID or raw UUIDs as model source tokens", () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    expect(() => canonicalizeReportDraftTokens(modelDraft([typoId]), aliases)).toThrow();
    expect(() => canonicalizeReportDraftTokens(modelDraft([noteId]), aliases)).toThrow();
  });

  it("rejects unknown SRC_999", () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    expect(() => canonicalizeReportDraftTokens(modelDraft(["SRC_999"]), aliases)).toThrow();
  });

  it("assigns multiple authorized source types deterministic unique tokens", () => {
    const aliases = buildReportSourceAliases({ evidence: [{ id: evidenceId }], research_notes: [{ id: noteId }] });
    expect(aliases).toEqual([
      { kind: "research_note", id: noteId, source_token: "SRC_001" },
      { kind: "evidence", id: evidenceId, source_token: "SRC_002" },
    ]);
  });

  it("repairs one invalid token into an allowed token and returns canonical source_refs", async () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify(modelDraft(["SRC_999"]))).mockResolvedValueOnce(JSON.stringify(modelDraft(["SRC_001"])));
    const result = await runReportDraftWorkflow({ allowed_source_tokens: ["SRC_001"], research_notes: [{ source_token: "SRC_001", content: "source text" }] }, aliases, chat);
    expect(result.sections[0].source_refs).toEqual([{ kind: "research_note", id: noteId }]);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("fails closed when repaired token remains invalid", async () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify(modelDraft(["SRC_999"]))).mockResolvedValueOnce(JSON.stringify(modelDraft(["SRC_998"])));
    await expect(runReportDraftWorkflow({ allowed_source_tokens: ["SRC_001"] }, aliases, chat)).rejects.toMatchObject({ code: "report_provenance_unreliable" });
  });

  it("semantic repair includes no source content and no raw UUIDs", async () => {
    const aliases = buildReportSourceAliases({ research_notes: [{ id: noteId }] });
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify(modelDraft([noteId]))).mockResolvedValueOnce(JSON.stringify(modelDraft(["SRC_001"])));
    await runReportDraftWorkflow({ allowed_source_tokens: ["SRC_001"], research_notes: [{ source_token: "SRC_001", content: "do not resend" }] }, aliases, chat);
    const repair = chat.mock.calls[1][0][1].content;
    expect(repair).toContain("Allowed source_tokens: SRC_001");
    expect(repair).not.toContain("do not resend");
    expect(repair).not.toContain(noteId);
    expect(repair).not.toContain(typoId);
  });
});
