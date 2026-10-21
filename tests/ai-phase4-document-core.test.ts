import {describe,it,expect} from "vitest";
import {buildDocumentPlan,documentInputSchema,DocumentScanError} from "@/lib/ai/stage3/document-manifest";
import {aggregateDocumentCandidates,DocumentCandidateLimit} from "@/lib/ai/stage3/document-aggregation";
import type {Stage3Candidate,Stage3CandidateResponse} from "@/lib/ai/stage3/candidates";
import {readFileSync} from "node:fs";
const assetHash="a".repeat(64);
const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";

describe("AI Phase 4 chunk planner",()=>{
  it("covers all 34 physical pages, deterministically and without dropping tail pages",()=>{
    const pages=Array.from({length:34},(_,i)=>({page:i+1,text:"a".repeat(1000)}));
    const {manifest,chunks}=buildDocumentPlan(pages,assetHash);
    expect(manifest.pageCount).toBe(34);
    expect(manifest.chunks.length).toBe(5);
    expect(chunks.flatMap(c=>c.pieces.map(p=>p.page))).toEqual(pages.map(p=>p.page));
    expect(chunks.every(c=>c.chars<=8000)).toBe(true);
    expect(buildDocumentPlan(pages,assetHash).manifest).toEqual(manifest);
    expect(buildDocumentPlan(pages,"b".repeat(64)).manifest.fingerprint).not.toEqual(manifest.fingerprint);
  });
  it("splits oversized page with 400-character overlap and preserves page origins",()=>{
    const {chunks}=buildDocumentPlan([{page:7,text:"x".repeat(12000)}],assetHash);
    expect(chunks).toHaveLength(2);
    expect(chunks.map(x=>x.pageStart)).toEqual([7,7]);
    expect(chunks[0].pieces[0].text).toHaveLength(8000);
    expect(chunks[1].pieces[0].text).toHaveLength(4400);
  });
  it("rejects excess chunks explicitly rather than sampling document head",()=>{
    const many=Array.from({length:26},(_,i)=>({page:i+1,text:"x".repeat(8000)}));
    expect(()=>buildDocumentPlan(many,assetHash)).toThrow(
      expect.objectContaining({code:"document_chunk_limit",requiredChunks:26}));
  });
  it("rejects selected page ranges beyond 20 pages and arbitrary extra fields",()=>{
    const good={sourceId,assetId,selection:{kind:"pages",pageStart:1,pageEnd:20}};
    expect(documentInputSchema.safeParse(good).success).toBe(true);
    expect(documentInputSchema.safeParse({...good,selection:{kind:"pages",pageStart:1,pageEnd:21}}).success).toBe(false);
    expect(documentInputSchema.safeParse({...good,selectedText:"attacker-supplied"}).success).toBe(false);
  });
});
const support=(page:number)=>({statement:"INDICATOR",quote:"example.com is in the report",
  sourceToken:"DOC_P"+String(page).padStart(3,"0")+"_C01",page,kind:"PDF" as const,
  provenance:{sourceId,assetId}});
const indicator=(id:string,page:number,value="Example.COM"):Stage3Candidate=>({
  kind:"INDICATOR",derivation:"EXTRACTED",indicatorType:"DOMAIN",value,
  sourceSupport:[{source_token:support(page).sourceToken,quote:support(page).quote}],
  verifiedSupport:[support(page)],caveats:[],candidateId:id,status:"NOT_SAVED",
});
const claim=(id:string,claimText:string):Stage3Candidate=>({
  kind:"SOURCE_CLAIM",derivation:"EXTRACTED",claim:claimText,claimType:"OTHER",
  stance:"ASSERTS",sourceQualifier:null,sourceSupport:[{source_token:support(3).sourceToken,quote:support(3).quote}],
  verifiedSupport:[support(3)],caveats:[],candidateId:id,status:"NOT_SAVED",
});
const res=(...candidates:Stage3Candidate[]):Stage3CandidateResponse=>({candidates,discarded:0,warnings:[]});
describe("AI Phase 4 deterministic review aggregation",()=>{
  it("merges exact domain identity but retains citations from all original pages",()=>{
    const actual=aggregateDocumentCandidates([res(indicator("i1",1)),res(indicator("i2",12,"example.com"))]);
    expect(actual.candidates).toHaveLength(1);
    expect(actual.candidates[0].verifiedSupport.map(x=>x.page)).toEqual([1,12]);
    expect(actual.candidates[0].status).toBe("NOT_SAVED");
  });
  it("never semantically merges two different source claims",()=>{
    const actual=aggregateDocumentCandidates([res(claim("claim1","APT28 targeted logistics.")),
      res(claim("claim2","Transport organizations were targeted."))]);
    expect(actual.candidates).toHaveLength(2);
  });
  it("honors the candidate limit rather than silently cutting off records",()=>{
    const responses=[res(claim("claim1","A")),res(claim("claim2","B"))];
    expect(()=>aggregateDocumentCandidates(responses,1)).toThrow(DocumentCandidateLimit);
  });
  it("preserves case of potentially case-sensitive URL paths",()=>{
    const url=(id:string,value:string):Stage3Candidate=>({...indicator(id,5),indicatorType:"URL",value});
    expect(aggregateDocumentCandidates([res(url("a","https://test.invalid/A")),
      res(url("b","https://test.invalid/a"))]).candidates).toHaveLength(2);
  });
});
describe("No autonomous CTI domain write boundary",()=>{
  it("AI prepare/chunk routes cannot import record mutation actions",()=>{
    for(const p of ["prepare","chunk"]){
      const text=readFileSync("src/app/api/projects/[id]/ai/processing/document/"+p+"/route.ts","utf8");
      expect(text).toContain("requireOwnedProject");
      expect(text).not.toMatch(/from ["']@\/app\/projects\/.*actions/);
      expect(text).not.toContain("createSourceClaim(");
      expect(text).not.toContain(".insert(");
      expect(text).not.toContain(".upsert(");
    }
  });
});
