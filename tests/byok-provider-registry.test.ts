import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { describe, expect, it } from "vitest";
import { byokProviders, fixedProviderUrl, getByokProvider, modelIdSchema, parseModelList } from "@/lib/ai/byok/providers";
describe("BYOK provider registry", () => {
 it("uses exact fixed HTTPS endpoints", () => { expect(fixedProviderUrl(byokProviders.openai,"/chat/completions")).toBe("https://api.openai.com/v1/chat/completions"); expect(fixedProviderUrl(byokProviders.openrouter,"/models")).toBe("https://openrouter.ai/api/v1/models"); expect(fixedProviderUrl(byokProviders.groq,"/chat/completions")).toBe("https://api.groq.com/openai/v1/chat/completions"); });
 it("rejects unsupported and unsafe model IDs", () => { expect(()=>getByokProvider("http://127.0.0.1/v1")).toThrow(); expect(modelIdSchema.safeParse("gpt-4.1-mini").success).toBe(true); expect(modelIdSchema.safeParse("https://evil.test/model").success).toBe(false); expect(modelIdSchema.safeParse("x".repeat(121)).success).toBe(false); });
 it("parses bounded model lists", () => { expect(parseModelList("openai", { data: [{ id: "gpt-4.1-mini" }, { id: "bad model" }] })).toEqual([{ id:"gpt-4.1-mini", label:"gpt-4.1-mini", providerId:"openai" }]); });
});
