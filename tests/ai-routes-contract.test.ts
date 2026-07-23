import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("AI route and UI contracts", () => {
  const generate = fs.readFileSync("src/app/api/projects/[id]/ai/generate/route.ts", "utf8");
  const approve = fs.readFileSync("src/app/api/projects/[id]/ai/approve/route.ts", "utf8");
  const ui = fs.readFileSync("src/components/ai/ai-workspace.tsx", "utf8");

  it("generation reserves/completes usage but contains no content mutations", () => {
    expect(generate).toContain('reserve_ai_usage_event');
    expect(generate).toContain('complete_ai_usage_event');
    expect(generate).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  it("generation whitelists report source fields and does not select star", () => {
    expect(generate).toContain('const allowed: Record<string, string>');
    expect(generate).not.toContain('.select("*")');
    expect(generate).toContain('evidence: "id,title,type,description,source_url,collection_date,tags"');
    expect(generate).toContain('malware: "id,name,family,hashes,description,behavior"');
    expect(generate).toContain('cves: "id,cve_id,description,severity,affected_product,exploit_status,references"');
    expect(generate).toContain('mitre_techniques: "id,technique_id,technique_name,tactic,description"');
    expect(generate).toContain('reportSourceCount === 0');
    expect(generate).toContain('Select at least one available report source.');
  });


  it("report draft generation uses canonical note/evidence selections without generic duplication", () => {
    expect(generate).toContain('if (parsed.workflow !== "generate_report_draft")');
    expect(generate).toContain('parsed.selections');
    expect(generate).toContain('research_notes: "id,title,content,tags"');
  });




  it("entity extraction uses candidate repair and removes untrusted provenance", () => {
    expect(generate).toContain("runEntityExtractionWorkflow(source)");
    expect(generate).toContain("allowedRefs.has");
    expect(generate).toContain("source_ref: entity.source_ref");
  });

  it("translation generation uses server-owned target/source canonicalization", () => {
    expect(generate).toContain('runTranslationWorkflow(parsed.targetLanguage!');
    expect(generate).toContain('Select exactly one note or evidence source for translation.');
    expect(generate).toContain('translation_invalid');
  });

  it("report generation returns report source IDs from canonical aliases", () => {
    expect(generate).toContain('sourceRecordIds: parsed.workflow === "generate_report_draft"');
    expect(generate).toContain('reportAliases.map((a) => a.id)');
  });

  it("approval exposes all six explicit approval payloads", () => {
    for (const kind of ["save_summary_note", "add_indicator", "add_indicators", "add_entity", "link_mitre", "save_report_draft", "save_translation_note"]) {
      expect(approve).toContain(kind);
      expect(ui).toContain(kind);
    }
  });


  it("report approval batches same-project provenance checks", () => {
    expect(approve).toContain("verifyReportDraftRefs");
    expect(approve).toContain('select("id", { count: "exact", head: true })');
    expect(approve).toContain("Report draft contains unavailable source references.");
  });


  it("entity approval preserves duplicate and CVE validation paths", () => {
    expect(approve).toContain('cveSchema.parse');
    expect(approve).toContain('duplicate: true');
    expect(approve).toContain('uniqueCol');
  });

  it("MITRE approval accepts technique IDs, not UUID arrays", () => {
    expect(approve).toContain('techniques: z.array');
    expect(approve).toContain('technique_name');
    expect(approve).toContain('mitreAttackIdSchema');
    expect(approve).not.toContain('techniqueIds: z.array(uuid)');
  });

  it("client UI does not reference server-only AI environment variables", () => {
    expect(ui).not.toMatch(/AI_|NEXT_PUBLIC_AI/);
  });
});
