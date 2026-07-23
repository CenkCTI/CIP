import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ByokConnectionPanel } from "@/components/ai/byok-connection-panel";
import { DemoAiClient } from "@/app/demo/ai/ui";
import { AiWorkspace } from "@/components/ai/ai-workspace";

const fetchMock = vi.fn();
beforeEach(() => { vi.restoreAllMocks(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("shared BYOK connection panel", () => {
  it("renders on guest and authenticated screens", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "reachable", model: "qwen3:4b-instruct", message: "ready" }) });
    const { rerender } = render(<DemoAiClient />);
    expect(screen.getByTestId("byok-connection-panel")).toBeInTheDocument();
    rerender(<AiWorkspace projectId="33333333-3333-4333-8333-333333333333" notes={[]} evidence={[]} campaigns={[]} malware={[]} />);
    expect(screen.getByTestId("byok-connection-panel")).toBeInTheDocument();
  });

  it("connects without rendering plaintext key and disconnects with structured responses", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true, provider: "OpenAI", providerId: "openai", model: "gpt-4.1-mini", expiresAt: "2026-07-23T20:00:00.000Z" }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ connected: false, state: "disconnected" }) });
    const user = userEvent.setup(); const onStatusChange = vi.fn();
    render(<ByokConnectionPanel scope="user" onStatusChange={onStatusChange} />);
    await user.type(screen.getByRole("textbox", { name: "BYOK model ID" }), "gpt-4.1-mini");
    await user.type(screen.getByLabelText("BYOK API key"), "sk-secret-test-value");
    await user.click(screen.getByRole("button", { name: "Test and Connect" }));
    await screen.findByText(/Connected to OpenAI/);
    expect(document.body.textContent).not.toContain("sk-secret-test-value");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ai/byok/connect");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).apiKey).toBe("sk-secret-test-value");
    await user.click(screen.getByRole("button", { name: "Disconnect BYOK" }));
    await screen.findByText(/credential cookie was cleared/);
    expect(JSON.stringify(await fetchMock.mock.results[1].value)).not.toContain("sk-secret-test-value");
  });

  it("shows structured provider errors without secrets", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "key_rejected" }) });
    const user = userEvent.setup();
    render(<ByokConnectionPanel scope="guest" />);
    await user.type(screen.getByRole("textbox", { name: "BYOK model ID" }), "openai/gpt-4o-mini");
    await user.type(screen.getByLabelText("BYOK API key"), "or-secret-test-value");
    await user.click(screen.getByRole("button", { name: "Test and Connect" }));
    await screen.findByText("Provider rejected the API key.");
    expect(document.body.textContent).not.toContain("or-secret-test-value");
  });

  it("authenticated users can connect, select BYOK, generate, disconnect, and return to Ollama", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "reachable", model: "qwen3:4b-instruct", message: "ready" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ connected: true, provider: "Groq", providerId: "groq", model: "llama-3.1-8b-instant", expiresAt: "2026-07-23T20:00:00.000Z" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { title_suggestion: "Summary", executive_summary: "Body", key_findings: [], intelligence_gaps: [], caveats: [], cited_source_note_ids: [], disclaimer: "review" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ connected: false, state: "disconnected" }) });
    const user = userEvent.setup();
    render(<AiWorkspace projectId="33333333-3333-4333-8333-333333333333" notes={[]} evidence={[]} campaigns={[]} malware={[]} />);
    await user.type(screen.getByRole("textbox", { name: "BYOK model ID" }), "llama-3.1-8b-instant");
    await user.type(screen.getByLabelText("BYOK API key"), "gsk-secret-test-value");
    await user.click(screen.getByRole("button", { name: "Test and Connect" }));
    await screen.findByText(/Connected to Groq/);
    await user.click(screen.getByRole("button", { name: "Connected BYOK" }));
    await user.click(screen.getByRole("button", { name: "Generate AI Suggestions" }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[2][1].body).providerMode).toBe("byok"));
    expect(JSON.stringify(fetchMock.mock.calls[2])).not.toContain("gsk-secret-test-value");
    await user.click(screen.getByRole("button", { name: "Disconnect BYOK" }));
    await screen.findByText(/credential cookie was cleared/);
    await user.click(screen.getByRole("button", { name: "Local Ollama" }));
    expect(screen.getByRole("button", { name: "Local Ollama" })).toHaveClass("border-cyan-400");
  });
});
