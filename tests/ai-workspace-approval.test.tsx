import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiWorkspace } from "@/components/ai/ai-workspace";

const projectId = "33333333-3333-4333-8333-333333333333";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "reachable", model: "qwen3:4b-instruct", message: "ready" }) });
});

describe("AI Workspace approval payloads", () => {
  it("sends strict allowlisted indicator payload and marks the item saved", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { indicators: [{ value: "Example.COM", type: "DOMAIN", confidence: "HIGH", evidence_context: "seen", source_ref: { kind: "note", id: "11111111-1111-4111-8111-111111111111" }, validation: { valid: true, normalized: "example.com" }, duplicate_id: null }], warnings: [], disclaimer: "review" } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, result: { status: "created", id: "22222222-2222-4222-8222-222222222222", value: "example.com", type: "DOMAIN" } }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Extract Indicators" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Add Example.COM" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload).toEqual({ kind: "add_indicator", indicator: { value: "Example.COM", type: "DOMAIN", confidence: "HIGH", source_ref: { kind: "note", id: "11111111-1111-4111-8111-111111111111" } } });
    expect(JSON.stringify(payload)).not.toContain("evidence_context");
    expect(JSON.stringify(payload)).not.toContain("validation");
    expect(JSON.stringify(payload)).not.toContain("duplicate_id");
    expect(await screen.findByText("created")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Example.COM" })).toBeDisabled();
  });

  it("bulk adds only valid unsaved indicators with allowlisted primitive fields", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { indicators: [
      { value: "8.8.8.8", type: "IP", confidence: "MEDIUM", evidence_context: "seen", validation: { valid: true, normalized: "8.8.8.8" }, duplicate_id: null },
      { value: "abc", type: "HASH", confidence: "LOW", evidence_context: "bad", validation: { valid: false, error: "Use a common MD5, SHA-1, or SHA-256 hex hash." }, duplicate_id: null },
    ], warnings: [], disclaimer: "review" } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, results: [{ status: "created", value: "8.8.8.8", type: "IP" }] }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Extract Indicators" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Add All Valid" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload).toEqual({ kind: "add_indicators", indicators: [{ value: "8.8.8.8", type: "IP", confidence: "MEDIUM", source_ref: null }] });
  });

  it("translation approval sends server-verifiable source identity instead of source text", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { translated_text: "hola CVE-2024-12345", target_language: "Spanish", source_record_id: "11111111-1111-4111-8111-111111111111", preservation_warnings: [], disclaimer: "review" } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "22222222-2222-4222-8222-222222222222" }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Translate Document" }));
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Save as New Note" }));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload.source).toEqual({ kind: "note", id: "11111111-1111-4111-8111-111111111111" });
    expect(payload.sourceText).toBeUndefined();
  });

  it("prevents report generation without a selected source", async () => {
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Generate Report Draft" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    expect(await screen.findByText("Select at least one available report source.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not show Save as Draft Report for an invalid empty draft", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { title: "", report_type_suggestion: "TECHNICAL", sections: [], caveats: [], disclaimer: "limited" } }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Generate Report Draft" }));
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Report draft is incomplete");
    expect(screen.queryByRole("button", { name: "Save as Draft Report" })).not.toBeInTheDocument();
  });

  it("a valid canonical report draft can be approved as a DRAFT report", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { title: "Report", report_type_suggestion: "TECHNICAL", sections: [{ heading: "Findings", paragraphs: ["Body"], source_refs: [{ kind: "research_note", id: "11111111-1111-4111-8111-111111111111" }] }], caveats: [], disclaimer: "AI-generated; review required." } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "22222222-2222-4222-8222-222222222222" }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Generate Report Draft" }));
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Save as Draft Report" }));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload.kind).toBe("save_report_draft");
    expect(payload.draft.title).toBe("Report");
  });
});
