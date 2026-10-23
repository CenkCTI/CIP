import {describe,it,expect} from "vitest";
import {explicitPdfPages,requestedPdfPages,retrievalProbe,prioritizedEvidenceChunks,wantsCrossSourceEvidence,rankActivePdfChunks,type IndexedEvidenceChunk}
  from "@/lib/ai/stage3/evidence-retrieval";
import {readFileSync} from "node:fs";
const row=(page_number:number,chunk_number=1):IndexedEvidenceChunk=>({
  source_id:"source-A",asset_id:"asset-A",page_number,chunk_number,content:"Original source text",
});
describe("PR83 ANSSI page retrieval regressions",()=>{
  it("recognizes exact Turkish and English page requests but not document length or CVE years",()=>{
    expect(explicitPdfPages("ANSSI raporunun 3. sayfasında ne yazıyor?")).toEqual([3]);
    expect(explicitPdfPages("4. sayfada CVE-2023-23397'yi açıkla")).toEqual([4]);
    expect(explicitPdfPages("15. sayfadan başlayan tavsiyeler")).toEqual([15]);
    expect(explicitPdfPages("What does page 3 say?")).toEqual([3]);
    expect(explicitPdfPages("23 sayfalık raporun amacını açıkla")).toEqual([]);
    expect(explicitPdfPages("CVE-2023-23397 ve Mart 2022")).toEqual([]);
  });
  it("reads the next two pages of a section starting at a named PDF page",()=>{
    expect(requestedPdfPages("Raporun 15. sayfadan başlayan güvenlik önerilerini listele")).toEqual([15,16,17]);
    expect(requestedPdfPages("3. sayfadaki hedefleri göster")).toEqual([3]);
    expect(requestedPdfPages("198. sayfadan başlayan bölümü açıkla")).toEqual([198,199,200]);
  });
  it("issues French probes independently of alphabetically truncated Turkish words",()=>{
    expect(retrievalProbe("APT28 operasyonlarının stratejik amacı nedir?"))
      .toContain("espionnage");
    expect(retrievalProbe("3. sayfada hangi Fransız kurum türleri hedef alındı?"))
      .toContain("gouvernementales");
    expect(retrievalProbe("15. sayfada kimlik doğrulama önerilerini özetle"))
      .toContain("authentification");
    expect(retrievalProbe("15. sayfadaki korunma önerilerini göster"))
      .toContain("recommandations");
    expect(retrievalProbe("CVE-2023-23397 ne zaman?")).toBeNull();
  });
  it("promotes explicit page evidence over irrelevant bibliography and lexical hits",()=>{
    const ranked=prioritizedEvidenceChunks([row(3)],[row(3),row(8)],[row(21),row(5)],4);
    expect(ranked.map(v=>v.page_number)).toEqual([3,8,21,5]);
    const recommendations=prioritizedEvidenceChunks([row(15,1),row(15,2)],
      [row(21)],[row(7),row(5)],4);
    expect(recommendations.map(v=>v.page_number)).toEqual([15,15,21,7]);
  });
  it("keeps different source assets distinct even when their page numbers match",()=>{
    const different={...row(3),asset_id:"asset-B"};
    expect(prioritizedEvidenceChunks([row(3)],[different],[row(3)],12)).toHaveLength(2);
  });
  it("isolates the selected original by default, cross-source only on explicit request",()=>{
    expect(wantsCrossSourceEvidence("Yalnızca CERT Polska PDF'sini kullan")).toBe(false);
    expect(wantsCrossSourceEvidence("CERT Polska raporundaki saldırı zincirini açıkla")).toBe(false);
    expect(wantsCrossSourceEvidence("Diğer kaynaklarla karşılaştır")).toBe(true);
  });
  it("keeps every source page when the whole selected PDF fits the context window",()=>{
    const all=[row(1,1),row(1,2),row(2,1),row(2,2),row(2,3),row(3),
      row(4,1),row(4,2),row(4,3),row(5,1),row(5,2)];
    const ranked=rankActivePdfChunks(all,"CERT Polska raporunun önerileri",12);
    expect(ranked).toHaveLength(11);
    expect(ranked.map(r=>r.page_number)).toContain(3);
  });
  it("keeps direct lookups owner/project/index scoped and preserves original text",()=>{
    const indexer=readFileSync("src/lib/ai/stage3/indexed-investigation-memory.ts","utf8");
    const route=readFileSync("src/app/api/projects/[id]/ai/processing/analyst-chat/route.ts","utf8");
    const analyst=readFileSync("src/lib/ai/stage3/analyst-reasoning.ts","utf8");
    expect(indexer).toContain('.eq("project_id",owned.projectId)');
    expect(indexer).toContain('.eq("owner_id",owned.user.id)');
    expect(indexer).toContain('.eq("index_id",index.data.id)');
    expect(indexer).toContain("requestedPdfPages(question)");
    expect(route).toContain("PDF_GLYPH_INTEGRITY_WARNING");
    expect(analyst).toContain("NEVER reconstruct a date");
  });
});
