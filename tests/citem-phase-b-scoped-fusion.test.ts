import {describe,it,expect} from "vitest";
import {fuseScopedSqlCandidates} from "@/lib/ai/stage3/semantic-retrieval";
import type {IndexedEvidenceChunk} from "@/lib/ai/stage3/evidence-retrieval";
const r=(page:number,asset="a",text="apt report"):IndexedEvidenceChunk=>({
 page_number:page,chunk_number:1,source_id:asset,asset_id:asset,content:text,
});
describe("Phase B scoped SQL reciprocal rank fusion",()=>{
 it("leaves lexical-only retrieval completely functional",()=>{
  expect(fuseScopedSqlCandidates([r(1),r(2)],[],"report").map(x=>x.page_number))
   .toEqual([1,2]);
 });
 it("combines ranks, eliminates duplicate original chunk and prioritizes exact CVE",()=>{
  const c=r(3,"a","CVE-2023-23397");
  const out=fuseScopedSqlCandidates([r(1),c],[c,r(2)],"CVE-2023-23397");
  expect(out[0].page_number).toBe(3);
  expect(out).toHaveLength(3);
 });
 it("does not discard a relevant source because other assets rank higher",()=>{
  const lexical=Array.from({length:10},(_,i)=>r(i+1));
  const sem=[r(1,"b"),r(1,"c")];
  const out=fuseScopedSqlCandidates(lexical,sem,"report",9);
  expect(out.filter(x=>x.asset_id==="a").length).toBeLessThanOrEqual(4);
  expect(new Set(out.map(x=>x.asset_id)).size).toBe(3);
 });
});
