import React from "react";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { BrandedReportPdf, reportPdfMetadata, REPORT_PDF_SECTIONS } from "@/lib/reports/branded-pdf";
import { parseJsonDoc } from "@/lib/reports/schema";
import { REPORT_PDF_COLORS } from "@/lib/reports/render";

const content = {
  type: "doc",
  attrs: { version: 1 },
  content: [
    {type:"heading",attrs:{level:1},content:[{type:"text",text:"Technical findings"}]},
    {type:"paragraph",content:[{type:"text",text:"CERT Polska reports malicious phishing links. Şüpheli alan adları incelendi."}]},
    {type:"blockquote",content:[{type:"paragraph",content:[{type:"text",text:"Attributed to APT28 by the cited source, not independently verified."}]}]},
    {type:"bulletList",content:[{type:"listItem",content:[{type:"paragraph",content:[{type:"text",text:"Observe host indicators"}]}]}]},
    {type:"table",content:[
      {type:"tableRow",content:[
        {type:"tableHeader",attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:"paragraph",content:[{type:"text",text:"Indicator"}]}]},
        {type:"tableHeader",attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:"paragraph",content:[{type:"text",text:"Analyst note"}]}]},
      ]},
      {type:"tableRow",content:[
        {type:"tableCell",attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:"paragraph",content:[{type:"text",text:"example.org"}]}]},
        {type:"tableCell",attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:"paragraph",content:[{type:"text",text:"Observed in source only"}]}]},
      ]},
    ]},
  ],
};
const parsed=parseJsonDoc(content);
if(!parsed.success)throw Error("fixture failed schema check");
const doc=parsed.data;
const version={
  title_snapshot:"APT28 / Polonya devlet kurumlarına yönelik oltalama operasyonu",
  product_type_snapshot:"OPERATIONAL_INTELLIGENCE_REPORT",
  version_status:"APPROVED",version_number:3,
  created_at:"2026-10-20T12:00:00Z",published_at:"2026-10-20T13:00:00Z",
  created_by:"11111111-1111-4111-8111-111111111111",
  executive_summary_snapshot:"Polonya devlet kurumlarını hedefleyen oltalama gözlendi.",
  key_judgments_snapshot:"Teknik benzerlikler aktörle bağlantı iddiasını desteklemektedir.",
  confidence_snapshot:"Medium — based on source reporting",
  intelligence_gaps_snapshot:"İkincil doğrulama eksik.",
  recommendations_snapshot:"Bağımsız IOC doğrulaması yapılmalı.",
  change_summary:"Güncel sürümde kaynaklar ve göstergeler değiştirildi.",
  report_version_references:[{
    reference_type:"SOURCE",
    label_snapshot:"CERT Polska — malicious campaign report",
    state_snapshot:{title:"Source preserved"},
    source_updated_at:"2026-10-19T12:00:00Z",
  }],
};
function savePreview(name:string,bytes:Buffer){
  const directory=process.env.REPORT_PDF_PREVIEW_DIR;
  if(!directory)return;
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,name),bytes);
}
async function extractText(bytes:Buffer){
  const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
  // PDF.js may transfer the provided bytes; never reuse the underlying buffer.
  const task=getDocument({
    data:Uint8Array.from(bytes),useSystemFonts:true,
    disableFontFace:true,isEvalSupported:false,
  });
  const pdf=await task.promise;
  try{
    const pages:string[]=[];
    for(let page=1;page<=pdf.numPages;page++){
      const text=await (await pdf.getPage(page)).getTextContent();
      pages.push(text.items.map((item)=>"str" in item?item.str:"").join(" "));
    }
    return pages;
  }finally{await pdf.destroy();}
}
describe("CİTEM branded report PDF",()=>{
  it("uses the same dark and bronze semantic palette as the app",()=>{
    expect(REPORT_PDF_COLORS.charcoal).toBe("#14191D");
    expect(REPORT_PDF_COLORS.amber).toBe("#B9822F");
    expect(REPORT_PDF_SECTIONS.map(([label])=>label)).toContain("Intelligence gaps");
  });
  it("correctly marks working drafts vs issued immutable versions without inventing publication",()=>{
    expect(reportPdfMetadata({title:"Türkçe",type:"CTI",status:"DRAFT"},false).draft).toBe(true);
    expect(reportPdfMetadata({...version,published_at:null},true).draft).toBe(true);
    const meta=reportPdfMetadata(version,true);
    expect(meta.draft).toBe(false);
    expect(meta.version).toBe("3");
  });
  it("renders a legible multi-page A4 report with an actual cover, Turkish Unicode, sections and appendix",async()=>{
    const buf=await renderToBuffer(<BrandedReportPdf record={version} content={doc} versioned={true}/>);
    savePreview("citem-report-issued-version.pdf",buf);
    const pdf=await PDFDocument.load(Uint8Array.from(buf));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    for(const page of pdf.getPages()){
      expect(page.getWidth()).toBeCloseTo(595.28,0);
      expect(page.getHeight()).toBeCloseTo(841.89,0);
    }
    const text=await extractText(buf);
    expect(text[0]).toContain("CİTEM");
    expect(text[0]).toContain("APT28");
    const body=text.slice(1).join(" ");
    expect(body).toContain("Document information");
    expect(body).toContain("Executive summary");
    expect(body).toContain("Intelligence gaps");
    expect(body).toContain("Frozen report content");
    expect(body).toContain("example.org");
    expect(body).toContain("Referenced-record appendix");
    expect(body).toContain("Polonya");
    expect(body).toContain("PAGE");
    expect(body).not.toContain("undefined");
  },30000);
  it("breaks long source text across multiple content pages without losing the footer",async()=>{
    const long=parseJsonDoc({type:"doc",attrs:{version:1},content:
      Array.from({length:70},(_,i)=>({type:"paragraph",content:[{
        type:"text",text:`Section ${i+1}: Turkish İstihbarat raporu — evidence from the source is not automatically corroborated.`,
      }]}))});
    expect(long.success).toBe(true);
    if(!long.success) return;
    const buf=await renderToBuffer(<BrandedReportPdf record={{title:"Multi-page",type:"CTI",status:"DRAFT",updated_at:"2026-10-20"}} content={long.data} versioned={false}/>);
    savePreview("citem-report-working-draft-multipage.pdf",buf);
    const pages=await extractText(buf);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.slice(1).map((page)=>page.includes("PAGE"))).toEqual(
      Array.from({length:pages.length-1},()=>true));
    expect(pages.join(" ")).toContain("Section 70");
    expect(pages[0]).toContain("WORKING / UNPUBLISHED COPY");
  },30000);
});
