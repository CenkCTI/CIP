import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
describe("Source-grounded analysis does not inherit unverified AI conclusions",()=>{
  it("keeps older model summaries out of RAG lexical expansion",()=>{
    const indexer=readFileSync("src/lib/ai/stage3/indexed-investigation-memory.ts","utf8");
    expect(indexer).toContain("events.slice(0,5).map(e=>e.question)");
    expect(indexer).not.toContain('e.question+" "+e.summary');
  });
  it("hides AI historical answers from new source-grounded model inputs",()=>{
    const route=readFileSync("src/app/api/projects/[id]/ai/processing/analyst-chat/route.ts","utf8");
    expect(route).toContain('previous_ai_response:""');
    expect(route).toContain('prior_unverified_analysis:""');
    expect(route).toContain('history:promptHistory,eventHistory:promptEventHistory');
  });
});
