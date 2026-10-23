import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const read=(p:string)=>readFileSync(p,"utf8");
describe("Phase A migration 068 code contract (not a PostgreSQL acceptance claim)",()=>{
 const sql=read("supabase/migrations/202610230068_citem_document_extraction_manifest.sql");
 it("creates immutable source-tied page extraction runs and owner-scoped read",()=>{
  for(const x of [
   "copilot_document_extraction_runs","copilot_document_extracted_pages",
   "asset_sha256","original_filename","original_mime_type","original_size_bytes",
   "original_text","search_text","original_text_sha256","extractor_version",
   "extraction_fingerprint","section_type","metadata_candidates",
   "foreign key(project_id,source_id,asset_id)",
   "enable row level security","to authenticated",
   "owner_id=(select auth.uid()) and public.project_is_owned(project_id)",
  ])expect(sql).toContain(x);
  expect(sql).toContain("from public,anon,authenticated");
  expect(sql).not.toMatch(/grant\s+(?:all|insert|update|delete).*copilot_document_extracted_pages\s+to\s+authenticated/);
 });
 it("enforces full page coverage and exact content hashes within v3 publish",()=>{
  for(const x of ["copilot_publish_document_index_v3",
   "copilot_publish_document_index_v2",
   "jsonb_array_length(p_pages)<>p_page_count",
   "count(distinct x.page_number)",
   "sha256(convert_to(x.original_text,'UTF8'))",
   "sha256(convert_to(x.content,'UTF8'))",
   "p_quality_status<>'COMPLETE'",
   "x.extractor not in ('pdfjs','poppler')",
   "p_index_version<>'CITEM-PDF-INDEX-A1-20261023'",
   "update public.copilot_document_indexes set",
   "status='READY'",
   "v_chunks_updated<>v_expected",
  ])expect(sql).toContain(x);
  expect(sql).not.toContain("security definer");
 });
 it("searches versioned original text and normalized aliases without leaking stale indexes",()=>{
  expect(sql).toContain("search_fts tsvector generated always");
  expect(sql).toContain("c.fts @@ q or c.search_fts @@ q");
  expect(sql).toContain("i.quality_status='COMPLETE'");
  expect(sql).toContain("i.extraction_run_id=c.extraction_run_id");
  expect(sql).toContain("i.asset_sha256=a.sha256");
  expect(sql).toContain("i.owner_id=c.owner_id");
 });
 it("does not rewrite existing migrations 066/067 and reuses their claim fencing",()=>{
  const idx=read("src/lib/ai/stage3/indexed-investigation-memory.ts");
  const old=read("supabase/migrations/202610230067_copilot_index_atomic_publish.sql");
  expect(idx).toContain("copilot_claim_document_index_v2");
  expect(idx).toContain("copilot_publish_document_index_v3");
  expect(old).toContain("i.claim_token=p_claim_token");
  expect(idx).toContain("canPublishExtraction");
  expect(idx).toContain("index_quality_review_required");
  expect(idx).toContain("cached.index_version===CITEM_INDEX_VERSION");
  expect(idx).toContain('cached.quality_status==="COMPLETE"');
 });
 it("never sends unverified glyphs from a selected page into model evidence",()=>{
  const route=read("src/app/api/projects/[id]/ai/processing/analyst-chat/route.ts");
  expect(route).toContain("corruptPageSpans");
  expect(route).toContain("safePageSpans");
  expect(route).toContain("PDF_GLYPH_INTEGRITY_WARNING");
  expect(route).toContain("FALLBACK_CURRENT_PAGE");
 });
});
