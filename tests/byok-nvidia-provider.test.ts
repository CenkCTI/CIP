import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it, beforeEach } from "vitest";
import { byokChat } from "@/lib/ai/byok/client";
import { byokProviders, fixedProviderUrl, getByokProvider, nvidiaNimModelAllowlist, publicProviderList, validateProviderModel } from "@/lib/ai/byok/providers";
import { runStructuredWorkflow } from "@/lib/ai/workflows";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("NVIDIA NIM BYOK provider", () => {
  it("is exposed as a fixed provider with an allowlisted documented model", () => {
    expect(publicProviderList().map((p) => p.id)).toContain("nvidia_nim");
    expect(getByokProvider("nvidia_nim").displayName).toBe("NVIDIA NIM");
    expect(fixedProviderUrl(byokProviders.nvidia_nim, "/chat/completions")).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(nvidiaNimModelAllowlist).toContain("nvidia/nemotron-3-super-120b-a12b");
    expect(validateProviderModel("nvidia_nim", "nvidia/nemotron-3-super-120b-a12b")).toBe(true);
    expect(validateProviderModel("nvidia_nim", "https://attacker.invalid/v1")).toBe(false);
    expect(validateProviderModel("nvidia_nim", "nvidia/not-in-the-bounded-list")).toBe(false);
  });

  it("omits unsupported NVIDIA response_format while preserving OpenAI formatting", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "{\"ok\":true}" } }] }) });
    await byokChat("nvidia_nim", "nvidia/nemotron-3-super-120b-a12b", "nvapi-secret", [{ role: "user", content: "Return JSON" }]);
    await byokChat("openai", "gpt-4.1-mini", "sk-secret", [{ role: "user", content: "Return JSON" }]);
    const nvidiaBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    const openAiBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(fetchMock.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe("Bearer nvapi-secret");
    expect(nvidiaBody.response_format).toBeUndefined();
    expect(openAiBody.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(openAiBody)).not.toContain("allow_fallbacks");
  });

  it("fails closed when malformed NVIDIA output does not satisfy workflow schemas", async () => {
    const malformed = async () => "not json";
    await expect(runStructuredWorkflow("summarize_research", { pastedText: "demo" }, malformed as never)).rejects.toMatchObject({ code: "malformed_output" });
  });
});
