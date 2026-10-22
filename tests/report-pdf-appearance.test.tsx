// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createCanvas } from "@napi-rs/canvas";
import { describe,expect,it } from "vitest";
import { BrandedReportPdf } from "@/lib/reports/branded-pdf";
import { reportPdfColors } from "@/lib/reports/render";
import {
  DARK_REPORT_PDF_PALETTES,
  isReportPdfAppearance,
  parseReportPdfAppearance,
  REPORT_PDF_APPEARANCES,
} from "@/lib/reports/pdf-appearance";
import { ReportPdfExportLink } from "@/components/reports/report-pdf-export-link";
import { parseJsonDoc } from "@/lib/reports/schema";

const fixture=parseJsonDoc({type:"doc",attrs:{version:1},content:[
  {type:"heading",attrs:{level:1},content:[{type:"text",text:"Situation overview"}]},
  {type:"paragraph",content:[{type:"text",text:"Evidence from CERT Polska and NIST CSF 2.0."}]},
  {type:"paragraph",content:[{type:"text",text:"Source link",marks:[{type:"link",attrs:{href:"https://www.nist.gov/cyberframework"}}]}]},
  {type:"table",content:[
    {type:"tableRow",content:[{type:"tableHeader",content:[{type:"paragraph",content:[{type:"text",text:"Evidence"}]}]}]},
    {type:"tableRow",content:[{type:"tableCell",content:[{type:"paragraph",content:[{type:"text",text:"Reviewed"}]}]}]},
  ]},
]});
if(!fixture.success)throw Error("Invalid report fixture");
const content=fixture.data;
const record={title:"Polonya CTI risk review",type:"OPERATIONAL_INTELLIGENCE_REPORT",status:"DRAFT",updated_at:"2026-10-22"};

describe("CİTEM report PDF export appearance",()=>{
  it("only accepts the three agreed options; invalid choices are rejected by API",()=>{
    expect(REPORT_PDF_APPEARANCES.map(x=>x.label)).toEqual(["Orijinal","Koyu Yeşil","Gece Siyahı"]);
    expect(isReportPdfAppearance("forest")).toBe(true);
    expect(isReportPdfAppearance("night")).toBe(true);
    expect(isReportPdfAppearance("sepia")).toBe(false);
    expect(parseReportPdfAppearance("unknown")).toBe("original");
    expect(reportPdfColors("original").paper).toBe("#FCFBF8");
    expect(reportPdfColors("forest").paper).toBe("#182B25");
    expect(reportPdfColors("night").paper).toBe("#151719");
    expect(DARK_REPORT_PDF_PALETTES.forest.ink).toBe("#E6EEE9");
  });

  it("renders a real accessible PDF export picker for the draft and versioned URLs",()=>{
    const html=renderToStaticMarkup(<ReportPdfExportLink href="/api/projects/p/reports/r/export/pdf?versionId=v1"/>);
    expect(html).toContain("PDF görünümü");
    expect(html).toContain("Koyu Yeşil");
    expect(html).toContain("Gece Siyahı");
    expect(html).toContain("versionId=v1&amp;appearance=original");
    const disabled=renderToStaticMarkup(<ReportPdfExportLink disabled href="/api/projects/p/reports/r/export/pdf"/>);
    expect(disabled).toContain("Saving before PDF");
    expect(disabled).not.toContain('href="/api/projects/p/reports/r/export/pdf');
  });

  it("generates real A4 PDF body backgrounds in selected colors while preserving text",async()=>{
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    for(const [appearance,expected] of [
      ["original",[252,251,248]],
      ["forest",[24,43,37]],
      ["night",[21,23,25]],
    ] as const){
      const buf=await renderToBuffer(<BrandedReportPdf record={record} content={content} versioned={false} appearance={appearance}/>);
      expect(buf.subarray(0,4).toString()).toBe("%PDF");
      const task=pdfjs.getDocument({data:Uint8Array.from(buf),useSystemFonts:true,disableFontFace:true,isEvalSupported:false});
      try{
        const parsed=await task.promise;
        expect(parsed.numPages).toBeGreaterThanOrEqual(2);
        const page=await parsed.getPage(2);
        const viewport=page.getViewport({scale:1});
        const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({canvas:canvas as unknown as HTMLCanvasElement,viewport}).promise;
        const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
        // Page margin: away from text, running header and footer.
        const offset=(250*canvas.width+20)*4;
        const actual=[...pixels.slice(offset,offset+3)];
        for(let c=0;c<3;c++)expect(actual[c]).toBeCloseTo(expected[c],-1);
        const pageContent=await page.getTextContent();
        expect(pageContent.items.map(x=>"str" in x?x.str:"").join(" ")).toContain("Situation overview");
      }finally{
        await task.destroy();
      }
    }
  },60000);
});
