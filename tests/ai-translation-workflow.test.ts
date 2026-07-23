import { describe, expect, it, vi } from "vitest";
import { buildTranslationPrompt } from "@/lib/ai/pure";
import { buildCanonicalTranslationResult, runTranslationWorkflow, translationModelSchema } from "@/lib/ai/workflows";

const sourceId = "11111111-1111-4111-8111-111111111111";
const sourceText = "Contact admin@example.com at 198.51.100.42 for CVE-2024-12345 and T1059.001 evidence in C:/Temp/payload.exe and HKEY_LOCAL_MACHINE\\Software\\Test";

describe("AI translation workflow", () => {
  it("puts Turkish in the trusted provider instruction", () => {
    const prompt = buildTranslationPrompt("Turkish", { source_text: sourceText }, []);
    expect(prompt[1].content).toContain("TRUSTED TRANSLATION INSTRUCTION: Translate the source text into exactly: Turkish");
    expect(prompt[1].content.indexOf("Translate the source text into exactly: Turkish")).toBeLessThan(prompt[1].content.indexOf("---BEGIN UNTRUSTED SOURCE DATA---"));
  });

  it("model-facing schema rejects server-owned translation fields", () => {
    expect(translationModelSchema.safeParse({ translated_text: "Merhaba", disclaimer: "review" }).success).toBe(true);
    expect(translationModelSchema.safeParse({ translated_text: "Merhaba", target_language: "en", source_record_id: sourceId, preservation_warnings: ["preserved"], disclaimer: "review" }).success).toBe(false);
  });

  it("server injects canonical target language, source id, and empty warnings when tokens are preserved", () => {
    const translated = "198.51.100.42 admin@example.com CVE-2024-12345 T1059.001 C:/Temp/payload.exe HKEY_LOCAL_MACHINE\\Software\\Test korundu.";
    const result = buildCanonicalTranslationResult({ translated_text: translated, disclaimer: "AI-generated; review required." }, "Turkish", sourceId, sourceText);
    expect(result.target_language).toBe("Turkish");
    expect(result.source_record_id).toBe(sourceId);
    expect(result.preservation_warnings).toEqual([]);
  });

  it("does not retain positive model-written preservation messages", () => {
    const parsed = translationModelSchema.safeParse({ translated_text: "198.51.100.42 admin@example.com CVE-2024-12345 T1059.001 C:/Temp/payload.exe HKEY_LOCAL_MACHINE\\Software\\Test çevrildi.", preservation_warnings: ["IP address 198.51.100.42 is preserved"], disclaimer: "review" });
    expect(parsed.success).toBe(false);
  });

  it("creates real warnings for missing protected values", () => {
    const result = buildCanonicalTranslationResult({ translated_text: "Eksik çeviri", disclaimer: "review" }, "Turkish", sourceId, sourceText);
    expect(result.preservation_warnings.join("\n")).toContain("198.51.100.42");
    expect(result.preservation_warnings.join("\n")).toContain("admin@example.com");
    expect(result.preservation_warnings.join("\n")).toContain("CVE-2024-12345");
    expect(result.preservation_warnings.join("\n")).toContain("T1059.001");
  });

  it("repairs unchanged English output for a Turkish request", async () => {
    const repaired = "198.51.100.42 admin@example.com CVE-2024-12345 T1059.001 C:/Temp/payload.exe HKEY_LOCAL_MACHINE\\Software\\Test için Türkçe çeviri.";
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify({ translated_text: sourceText, disclaimer: "review" })).mockResolvedValueOnce(JSON.stringify({ translated_text: repaired, disclaimer: "review" }));
    const result = await runTranslationWorkflow("Turkish", sourceId, sourceText, chat);
    expect(result.translated_text).toBe(repaired);
    expect(result.target_language).toBe("Turkish");
    expect(result.source_record_id).toBe(sourceId);
    expect(result.preservation_warnings).toEqual([]);
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("fails closed when repair remains unchanged", async () => {
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify({ translated_text: sourceText, disclaimer: "review" })).mockResolvedValueOnce(JSON.stringify({ translated_text: sourceText, disclaimer: "review" }));
    await expect(runTranslationWorkflow("Turkish", sourceId, sourceText, chat)).rejects.toMatchObject({ code: "translation_invalid" });
  });
});
