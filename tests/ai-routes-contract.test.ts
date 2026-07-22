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
  });

  it("approval exposes all six explicit approval payloads", () => {
    for (const kind of ["save_summary_note", "add_indicator", "add_entity", "link_mitre", "save_report_draft", "save_translation_note"]) {
      expect(approve).toContain(kind);
      expect(ui).toContain(kind);
    }
  });

  it("MITRE approval accepts technique IDs, not UUID arrays", () => {
    expect(approve).toContain('techniques: z.array');
    expect(approve).toContain('mitreAttackIdSchema');
    expect(approve).not.toContain('techniqueIds: z.array(uuid)');
  });

  it("client UI does not reference server-only AI environment variables", () => {
    expect(ui).not.toMatch(/AI_|NEXT_PUBLIC_AI/);
  });
});
