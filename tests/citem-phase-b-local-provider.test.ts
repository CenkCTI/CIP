import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const code=readFileSync("src/lib/ai/stage3/local-e5-provider.ts","utf8");
describe("Phase B self-hosted local embedding transport",()=>{
 it("requires opt-in, pinned immutable model revision, key and trusted host",()=>{
  for(const text of ["CITEM_SEMANTIC_RAG_ENABLED","CITEM_EMBEDDING_MODEL_REVISION",
   "CITEM_EMBEDDING_ALLOWED_HOST","CITEM_EMBEDDING_API_KEY",
   "target.hostname!==allowed","target.username","target.pathname",
   'target.protocol==="https:"'])expect(code).toContain(text);
 });
 it("retains model-aware query vs passage prefixes and fixed output dimensions",()=>{
  expect(code).toContain('purpose==="query"?"query: ":"passage: "');
  expect(code).toContain("const DIMS=384");
  expect(code).toContain("validateEmbeddingBatch");
  expect(code).toContain("AbortSignal.timeout(20000)");
  expect(code).toContain('dataBoundary:"LOCAL"');
 });
});
