import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {splitPagesForIndex,memorySearchQuery} from "@/lib/ai/stage3/index-chunks";
describe("Unified investigation memory RAG",()=>{
  it("splits pages into original-text overlapping citations",()=>{
    const content="APT28 ".repeat(700);
    const chunks=splitPagesForIndex([{page:1,text:content},{page:2,text:"ANSSI details strategic collection"}],1500,100);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(c=>c.content.length<=1500)).toBe(true);
    expect(chunks[0].content.slice(-100)).toBe(chunks[1].content.slice(0,100));
    expect(chunks.find(c=>c.page_number===2)?.content).toContain("ANSSI");
  });
  it("restores campaign identifiers for anaphoric follow-ups without treating memory as evidence",()=>{
    const q=memorySearchQuery("What was the strategic objective?",
      ["ANSSI analysis of APT28, GRU and CVE-2023-23397"]);
    expect(q).toContain("APT28");expect(q).toContain("GRU");
    expect(q).toContain("CVE-2023-23397");
    expect(q.length).toBeLessThanOrEqual(1000);
  });
  it("rejects oversized/unbounded index entries",()=>{
    expect(()=>splitPagesForIndex([{page:0,text:"A"}])).toThrow();
    expect(()=>splitPagesForIndex([{page:1,text:"A"}],3000)).toThrow();
  });
  it("uses owner RLS, source SHA freshness and an invoker-only search function",()=>{
    const sql=readFileSync("supabase/migrations/202610220066_copilot_unified_investigation_rag.sql","utf8");
    for(const table of ["copilot_document_indexes","copilot_document_chunks","copilot_investigation_events"]){
      expect(sql).toContain("alter table public."+table+" enable row level security");
    }
    expect(sql).toContain("owner_id=(select auth.uid()) and public.project_is_owned(project_id)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("i.asset_sha256=a.sha256");
    expect(sql).toContain("a.asset_role='ORIGINAL'");
    expect(sql).toContain("revoke all on function public.copilot_search_document_chunks");
  });
  it("makes context retrieval and source claims distinct, with cross-source citation safety",()=>{
    const analyst=readFileSync("src/app/api/projects/[id]/ai/processing/analyst-chat/route.ts","utf8");
    const ordinary=readFileSync("src/app/api/projects/[id]/ai/processing/route.ts","utf8");
    const ui=readFileSync("src/components/investigations/source-reader/ai/copilot-chat.tsx","utf8");
    expect(analyst).toContain("retrieveOwnedEvidence");
    expect(analyst).toContain("eventMemoryHints");
    expect(ordinary).toContain("saveInvestigationEvent");
    expect(ui).toContain("activeAssetId");expect(ui).toContain("Other source");
  });
  it("accepts only authenticated bounded upload/backfill indexing",()=>{
    const route=readFileSync("src/app/api/projects/[id]/ai/processing/index/route.ts","utf8");
    expect(route).toContain("validateOrigin(req)");
    expect(route).toContain("requireOwnedProject");
    expect(route).toContain(".slice(0,2)");
  });
});
