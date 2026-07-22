import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const summary = {
  title_suggestion: "Summary",
  executive_summary: "Executive summary.",
  key_findings: ["Finding"],
  intelligence_gaps: [],
  caveats: ["Caveat"],
  cited_source_note_ids: [],
  disclaimer: "AI-generated; review required.",
};

describe("structured workflow repair behavior", () => {
  it("a valid first response passes without a repair call", async () => {
    const { runStructuredWorkflow } = await import("@/lib/ai/workflows");
    const chat = vi.fn().mockResolvedValue(JSON.stringify(summary));
    await expect(runStructuredWorkflow("summarize_research", { notes: [{ id: "source-1", content: "secret source" }] }, chat)).resolves.toEqual(summary);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("a structurally incomplete first response triggers exactly one schema-aware repair", async () => {
    const { runStructuredWorkflow } = await import("@/lib/ai/workflows");
    const chat = vi.fn().mockResolvedValueOnce('{"title_suggestion":"Only title"}').mockResolvedValueOnce(JSON.stringify(summary));
    await expect(runStructuredWorkflow("summarize_research", { notes: [{ id: "source-1", content: "do not resend" }] }, chat)).resolves.toEqual(summary);
    expect(chat).toHaveBeenCalledTimes(2);
    const repairMessages = chat.mock.calls[1][0];
    expect(repairMessages[1].content).toContain("WORKFLOW CONTRACT FOR summarize_research");
    expect(repairMessages[1].content).toContain("executive_summary");
    expect(repairMessages[1].content).not.toContain("do not resend");
    expect(repairMessages[1].content).not.toContain("BEGIN UNTRUSTED SOURCE DATA");
  });

  it("a still-invalid repaired response fails closed with malformed_output", async () => {
    const { runStructuredWorkflow } = await import("@/lib/ai/workflows");
    const chat = vi.fn().mockResolvedValueOnce('{"title_suggestion":"Only title"}').mockResolvedValueOnce('{"still":"bad"}');
    await expect(runStructuredWorkflow("summarize_research", {}, chat)).rejects.toMatchObject({ code: "malformed_output" });
    expect(chat).toHaveBeenCalledTimes(2);
  });
});
