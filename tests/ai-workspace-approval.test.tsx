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
    await user.click(await screen.findByRole("button", { name: "Add example.com" }));
    expect(screen.getByText(/Observed Example.COM → normalized example.com/)).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload).toEqual({ kind: "add_indicator", indicator: { value: "example.com", type: "DOMAIN", confidence: "HIGH", source_ref: { kind: "note", id: "11111111-1111-4111-8111-111111111111" } } });
    expect(JSON.stringify(payload)).not.toContain("evidence_context");
    expect(JSON.stringify(payload)).not.toContain("validation");
    expect(JSON.stringify(payload)).not.toContain("duplicate_id");
    expect(await screen.findByText("created")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add example.com" })).toBeDisabled();
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


  it("entity approval sends allowlisted fields and disables saved/reused buttons", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { entities: [
      { entity_type: "campaigns", name: "Winter Echo", confidence: "LOW", evidence_excerpt: "Campaign Winter Echo", caveats: ["unverified"], source_ref: { kind: "note", id: "11111111-1111-4111-8111-111111111111" } },
      { entity_type: "actors", name: "Gray Lantern", confidence: "LOW", evidence_excerpt: "threat actor Gray Lantern", caveats: ["unverified"], source_ref: null },
      { entity_type: "malware", name: "ExampleLoader", confidence: "LOW", evidence_excerpt: "malware ExampleLoader", caveats: ["unverified"], source_ref: null },
    ], warnings: [], disclaimer: "review" } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "existing", duplicate: true }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "created-actor" }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "created-malware" }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Extract Entities" }));
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Save Winter Echo" }));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload).toEqual({ kind: "add_entity", entityType: "campaigns", name: "Winter Echo", description: "Campaign Winter Echo" });
    expect(JSON.stringify(payload)).not.toContain("confidence");
    expect(JSON.stringify(payload)).not.toContain("caveats");
    expect(await screen.findByText("existing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Winter Echo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Gray Lantern" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save Gray Lantern" }));
    expect(await screen.findByText("created")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Gray Lantern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save ExampleLoader" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save ExampleLoader" }));
    expect(screen.getByRole("button", { name: "Save ExampleLoader" })).toBeDisabled();
    const actorPayload = JSON.parse(fetchMock.mock.calls[3][1].body);
    const malwarePayload = JSON.parse(fetchMock.mock.calls[4][1].body);
    expect(actorPayload).toEqual({ kind: "add_entity", entityType: "actors", name: "Gray Lantern", description: "threat actor Gray Lantern" });
    expect(malwarePayload).toEqual({ kind: "add_entity", entityType: "malware", name: "ExampleLoader", description: "malware ExampleLoader" });
  });

  it("valid Turkish translation can be saved with server-verifiable source identity", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { translated_text: "Türkçe çeviri CVE-2024-12345", target_language: "Turkish", source_record_id: "11111111-1111-4111-8111-111111111111", preservation_warnings: [], disclaimer: "review" } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, id: "22222222-2222-4222-8222-222222222222" }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Translate Document" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Target language" }), "Turkish");
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await user.click(await screen.findByRole("button", { name: "Save as New Note" }));
    const payload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(payload.source).toEqual({ kind: "note", id: "11111111-1111-4111-8111-111111111111" });
    expect(payload.sourceText).toBeUndefined();
    expect(payload.title).toBe("AI translation to Turkish");
  });

  it("translation save is disabled for actual preservation warnings", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { translated_text: "eksik", target_language: "Turkish", source_record_id: "11111111-1111-4111-8111-111111111111", preservation_warnings: ["Protected token missing or changed: 198.51.100.42"], disclaimer: "review" } }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId={projectId} notes={[{ id: "11111111-1111-4111-8111-111111111111", label: "Note" }]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.click(await screen.findByRole("button", { name: "Translate Document" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Target language" }), "Turkish");
    await user.click(screen.getByRole("checkbox", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    expect(await screen.findByRole("button", { name: "Save as New Note" })).toBeDisabled();
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
