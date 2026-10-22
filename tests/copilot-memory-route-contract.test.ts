import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
describe("Persistent investigator memory and consent",()=>{
  it("requires owned-project access and per-user RLS for both memory tables",()=>{
    const sql=readFileSync("supabase/migrations/202610220064_copilot_investigation_memory.sql","utf8");
    expect(sql).toContain("copilot_memory_profiles enable row level security");
    expect(sql).toContain("copilot_memory_turns enable row level security");
    expect(sql).toContain("owner_id = (select auth.uid()) and public.project_is_owned(project_id)");
    expect(sql).toContain("foreign key(project_id,profile_id,owner_id)");
    expect(sql).not.toContain("to anon");
  });
  it("web browsing needs an explicit per-message toggle and never sends PDF or notes to Brave",()=>{
    const api=readFileSync("src/app/api/projects/[id]/ai/processing/analyst-chat/route.ts","utf8");
    const client=readFileSync("src/components/investigations/source-reader/ai/processing-copilot.tsx","utf8");
    expect(api).toContain("webResearch:z.boolean().default(false)");
    expect(api).toContain("getResearchProvider().search(query");
    expect(api).toContain("loadSelectedComparisonPages");
    expect(api).toContain("saveInvestigationTurn");
    expect(api).toContain("readInvestigationMemory");
    expect(client).toContain("setAnalystChat");
    expect(client).toContain("Research web for this message");
    expect(client).toContain("Include selected PDF evidence");
    expect(client).toContain("Clear saved chat");
  });
});
