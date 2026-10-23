import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const file=readFileSync("supabase/migrations/202610230069_citem_multilingual_e5_vector.sql","utf8");
describe("Phase B 069 safe vector schema contract",()=>{
 it("uses the documented 384-dimension E5 small and immutable exact source identity",()=>{
   expect(file).toContain("extensions.vector(384)");
   expect(file).toContain("intfloat/multilingual-e5-small");
   for(const field of ["source_embedding_approved","asset_sha256",
     "content_sha256","extraction_run_id","model_revision"])expect(file).toContain(field);
 });
 it("requires owner RLS, server-only writes, deny anon and current index version",()=>{
   for(const text of ["enable row level security","to authenticated",
    "to service_role","from public,anon,authenticated","security invoker",
    "i.status='READY'","i.quality_status='COMPLETE'",
    "i.extraction_run_id=e.extraction_run_id","a.sha256=e.asset_sha256",
    "e.owner_id=(select auth.uid())"])expect(file).toContain(text);
 });
 it("enforces tenant-scoped candidates before top k in SQL",()=>{
   expect(file.indexOf("where e.project_id=p_project_id")).toBeLessThan(
     file.indexOf("order by e.embedding OPERATOR(extensions.<=>) p_query_embedding"));
   expect(file).toContain("limit p_limit");
   expect(file).not.toContain("security definer");
 });
});
