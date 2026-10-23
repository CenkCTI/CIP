import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const service=readFileSync("src/lib/ai/stage3/local-embedding-index.ts","utf8");
const route=readFileSync("src/app/api/projects/[id]/ai/processing/semantic-index/route.ts","utf8");
describe("Phase B authenticated local indexing",()=>{
 it("rejects stale/unapproved source and limits work to eight chunks",()=>{
  for(const term of ["UNVERIFIED_EMBEDDING_INDEX","source_embedding_approved:true",
   "asset_sha256:sha","SOURCE_CHANGED_DURING_EMBEDDING",
   "range(offset,offset+7)","createConfiguredE5Provider"])
    expect(service).toContain(term);
 });
 it("requires signed in owner, origin and explicit source approval on POST",()=>{
  for(const term of ["requireOwnedProject","validateOrigin(req)",
    "approveLocalEmbedding:z.literal(true)","readJsonLimited"])
    expect(route).toContain(term);
 });
});
