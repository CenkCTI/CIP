import {describe,it,expect} from "vitest";
import {canUseEmbeddingProvider,compatibleEmbeddings,validateEmbeddingBatch,type EmbeddingMetadata}
 from "@/lib/ai/stage3/embedding-provider";
import {exactIdentifiers,fuseEvidenceRanks,type RankedCandidate}
 from "@/lib/ai/stage3/hybrid-retrieval";
const metadata:EmbeddingMetadata={providerId:"fixture",modelId:"fixture-test-model",
 modelRevision:"sha256:fixture",dimensions:64,metric:"cosine",normalized:true,
 maxInputTokens:256,dataBoundary:"EXTERNAL"};
const scope={projectId:"projectA",ownerId:"ownerA",indexVersion:"vA"};
const row=(asset_id:string,page_number:number,content:string):RankedCandidate=>({
 project_id:"projectA",owner_id:"ownerA",source_id:asset_id,asset_id,
 source_sha256:"a".repeat(64),index_version:"vA",quality_status:"COMPLETE",
 page_number,chunk_number:1,content,section_type:"BODY",
});
describe("Phase B privacy and provider contract",()=>{
 it("defaults to no external document transfer without BOTH explicit gates",()=>{
  const denied={semanticEnabled:true,externallyProcessedDocumentsApproved:false,
   sourceAllowsExternalProcessing:true};
  expect(canUseEmbeddingProvider(metadata,denied)).toBe(false);
  expect(canUseEmbeddingProvider(metadata,{...denied,
    externallyProcessedDocumentsApproved:true,sourceAllowsExternalProcessing:false})).toBe(false);
  expect(canUseEmbeddingProvider(undefined,{...denied,
    externallyProcessedDocumentsApproved:true})).toBe(false);
  expect(canUseEmbeddingProvider(metadata,{...denied,
    externallyProcessedDocumentsApproved:true})).toBe(true);
  expect(canUseEmbeddingProvider({...metadata,dataBoundary:"LOCAL"},denied)).toBe(true);
 });
 it("rejects model version mismatches, NaNs, wrong dimensions and empty vectors",()=>{
  expect(compatibleEmbeddings(metadata,{...metadata,modelRevision:"revision-other"})).toBe(false);
  expect(compatibleEmbeddings(metadata,{...metadata})).toBe(true);
  expect(()=>validateEmbeddingBatch(metadata,[[NaN,...Array(63).fill(0)]],1)).toThrow();
  expect(()=>validateEmbeddingBatch(metadata,[[1,2]],1)).toThrow();
  expect(()=>validateEmbeddingBatch(metadata,[Array(64).fill(0)],1)).toThrow();
  expect(()=>validateEmbeddingBatch(metadata,[[1,...Array(63).fill(0)]],1)).not.toThrow();
 });
});
describe("Phase B provenance-aware deterministic RRF",()=>{
 it("retains literal IDs in source quote without making them up",()=>{
  expect(exactIdentifiers("APT28, CVE-2023-23397 and CERTFR-2023-CTI-009"))
   .toEqual(["APT28","CVE-2023-23397","CERTFR-2023-CTI-009"]);
  const match=row("reportA",3,"ANSSI says APT28 and CVE-2023-23397");
  const related=row("reportA",4,"General cyber espionage observed");
  const out=fuseEvidenceRanks({lexical:[related,match],semantic:[related],scope,
    query:"CVE-2023-23397",limit:2});
  expect(out.items[0].row.page_number).toBe(3);
  expect(out.items[0].exactIdentifierMatch).toBe(true);
 });
 it("fuses lexical and semantic ranks without duplicate chunks or false source identity",()=>{
  const a=row("a",3,"L'espionnage visait des institutions");
  const b=row("b",2,"Targeted email collection");
  const out=fuseEvidenceRanks({lexical:[a,b,a],semantic:[b,a],scope,
    query:"stratejik amaç",limit:3});
  expect(out.items).toHaveLength(2);
  expect(out.status).toBe("HYBRID");
  expect(out.items.every(x=>x.lexicalRank!==null&&x.semanticRank!==null)).toBe(true);
 });
 it("rejects foreign tenants, stale versions and mismatched source SHA before final output",()=>{
  const allowed=row("a",3,"Original source");
  const unsafe=[{...allowed,owner_id:"foreign"},{...allowed,index_version:"vB"},
    {...allowed,source_sha256:"invalid"}];
  const out=fuseEvidenceRanks({lexical:[...unsafe,allowed],semantic:[],scope,
    query:"Original"});
  expect(out.status).toBe("LEXICAL_ONLY");
  expect(out.items).toHaveLength(1);
  expect(out.items[0].row.owner_id).toBe(scope.ownerId);
  expect(fuseEvidenceRanks({lexical:unsafe,semantic:[],scope,query:"a"}).status)
   .toBe("INSUFFICIENT_RETRIEVAL");
 });
 it("promotes source diversity across 3 assets without dropping the primary when one source",()=>{
  const lex=[...Array.from({length:10},(_,i)=>row("a",i+1,"Report A")),
    ...Array.from({length:2},(_,i)=>row("b",i+1,"Report B")),
    ...Array.from({length:2},(_,i)=>row("c",i+1,"Report C"))];
  const multi=fuseEvidenceRanks({lexical:lex,semantic:[],scope,query:"rapor",limit:9});
  expect(multi.items.filter(x=>x.row.asset_id==="a").length).toBeLessThanOrEqual(4);
  expect(new Set(multi.items.map(x=>x.row.asset_id)).size).toBe(3);
  const single=fuseEvidenceRanks({lexical:lex.slice(0,10),semantic:[],scope,query:"rapor",limit:9});
  expect(single.items).toHaveLength(9);
 });
});
