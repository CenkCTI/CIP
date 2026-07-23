import { describe, expect, it, vi } from "vitest";
import { workflowContractText } from "@/lib/ai/contracts";
import { extractExplicitEntityCandidates, hasExplicitEntityMarkers } from "@/lib/ai/pure";
import { runEntityExtractionWorkflow } from "@/lib/ai/workflows";

const liveNote = "Project record: Campaign Winter Echo is associated with threat actor Gray Lantern. Gray Lantern uses malware named ExampleLoader. The campaign also references vulnerability identifier CVE-2025-99999.";
const empty = { entities: [], warnings: [], disclaimer: "AI-generated; review required." };
const repaired = { entities: [
  { entity_type: "campaigns", name: "Winter Echo", confidence: "LOW", evidence_excerpt: liveNote, caveats: ["Project candidate; not externally verified."], source_ref: null },
  { entity_type: "actors", name: "Gray Lantern", confidence: "LOW", evidence_excerpt: liveNote, caveats: ["Project candidate; not externally verified."], source_ref: null },
  { entity_type: "malware", name: "ExampleLoader", confidence: "LOW", evidence_excerpt: liveNote, caveats: ["Project candidate; not externally verified."], source_ref: null },
  { entity_type: "cves", name: "CVE-2025-99999", confidence: "LOW", evidence_excerpt: liveNote, caveats: ["Syntactically valid CVE candidate; not externally verified."], source_ref: null },
], warnings: [], disclaimer: "AI-generated; review required." };

describe("AI entity extraction candidate behavior", () => {
  it("deterministically identifies the exact focused live Note candidates", () => {
    expect(extractExplicitEntityCandidates(liveNote).map((e) => `${e.entity_type}:${e.name}`)).toEqual(["campaigns:Winter Echo", "actors:Gray Lantern", "malware:ExampleLoader", "cves:CVE-2025-99999"]);
  });

  it("fictional or unverified labels do not suppress explicitly named candidates", () => {
    const text = "Synthetic internal campaign Winter Echo uses fictional malware ExampleLoader and threat actor Gray Lantern; CVE-2025-99999 is unverified.";
    expect(hasExplicitEntityMarkers(text)).toBe(true);
    expect(extractExplicitEntityCandidates(text).map((e) => e.name)).toEqual(expect.arrayContaining(["Winter Echo", "ExampleLoader", "Gray Lantern", "CVE-2025-99999"]));
    expect(extractExplicitEntityCandidates(text).every((e) => e.confidence === "LOW" && e.caveats.length > 0)).toBe(true);
  });

  it("prompt prohibits public database and external verification claims", () => {
    const prompt = workflowContractText("extract_entities");
    expect(prompt).toContain("not a reason to omit");
    expect(prompt).toContain("no browser or external threat-intelligence/CVE database");
    expect(prompt).toContain("Do not claim");
    expect(prompt).toContain("absent from public databases");
  });

  it("empty output with explicit markers receives one bounded repair attempt", async () => {
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify(empty)).mockResolvedValueOnce(JSON.stringify(repaired));
    const result = await runEntityExtractionWorkflow({ notes: [{ content: liveNote }] }, chat);
    expect(result.entities.map((e) => e.name)).toEqual(["Winter Echo", "Gray Lantern", "ExampleLoader", "CVE-2025-99999"]);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1][0][1].content).toContain(liveNote);
    expect(chat.mock.calls[1][0][1].content).toContain("candidate extraction, not authoritative external verification");
  });

  it("source without entity markers may legitimately remain empty without repair", async () => {
    const chat = vi.fn().mockResolvedValue(JSON.stringify(empty));
    const result = await runEntityExtractionWorkflow({ notes: [{ content: "No named CTI records here." }] }, chat);
    expect(result.entities).toEqual([]);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("repair fallback does not invent unsupported names", async () => {
    const chat = vi.fn().mockResolvedValueOnce(JSON.stringify(empty)).mockResolvedValueOnce(JSON.stringify(empty));
    const result = await runEntityExtractionWorkflow({ notes: [{ content: liveNote }] }, chat);
    expect(result.entities.map((e) => e.name)).toEqual(["Winter Echo", "Gray Lantern", "ExampleLoader", "CVE-2025-99999"]);
    expect(result.entities.map((e) => e.name)).not.toContain("APT-Imaginary");
  });
});
