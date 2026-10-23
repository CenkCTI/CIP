#!/usr/bin/env node
// Operator-run PDF.js acceptance; NO network access and NO document excerpts in logs.
// node --experimental-strip-types scripts/citem-anssi-pdf-baseline.mjs /path/to/CERTFR-2023-CTI-009.pdf
import {readFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";
import {splitPagesForIndex,memorySearchQuery} from "../src/lib/ai/stage3/index-chunks.ts";
import {assessDocumentTextQuality,normalizeForSearch} from "../src/lib/ai/stage3/document-quality.ts";
const path=process.argv[2];
if(!path){console.error("Usage: node --experimental-strip-types scripts/citem-anssi-pdf-baseline.mjs <local-official.pdf>");process.exit(2);}
const b=await readFile(path);
if(b.length>50*1024*1024||b.subarray(0,5).toString("utf8")!=="%PDF-"){
 console.error("INVALID_PDF_OR_TOO_LARGE");process.exit(2);
}
const sha=createHash("sha256").update(b).digest("hex");
const packageInfo=JSON.parse(readFileSync(new URL("../node_modules/pdfjs-dist/package.json",import.meta.url),"utf8"));
const task=getDocument({data:new Uint8Array(b),useSystemFonts:true,disableFontFace:true,isEvalSupported:false});
let pages=[],declaredPageCount=0;
try{
 const pdf=await task.promise;
 declaredPageCount=pdf.numPages;
 if(declaredPageCount>200)throw new Error("page_limit");
 for(let i=1;i<=declaredPageCount;i++){
  const page=await pdf.getPage(i);
  try{
   const textContent=await page.getTextContent();
   const text=textContent.items.map(item=>"str" in item?
     item.str+(item.hasEOL?"\n":" "):"").join("").replace(/[ \t]+/g," ").trim();
   pages.push({page:i,text});
  }finally{page.cleanup();}
 }
}finally{await task.destroy();}
const quality=assessDocumentTextQuality(pages);
const chunks=quality.pagesWithoutText===0&&quality.totalExtractedChars<=500000?
  splitPagesForIndex(pages):[];
const byPage=n=>pages[n-1]?.text??"";
const normalized=n=>normalizeForSearch(byPage(n)).toLowerCase();
const gold={
 documentPages:declaredPageCount===23,
 coverActor:normalized(1).includes("apt28"),
 coverDate:normalized(1).includes("26 octobre 2023"),
 tableOfContents:quality.pageDiagnostics[1]?.sectionType==="TABLE_OF_CONTENTS",
 page3Resume:/\bresume\b/.test(normalized(3)),
 page3SourceReportedEspionage:normalized(3).includes("espionnage"),
 page3OriginalQuote:normalized(3).includes(normalizeForSearch("utilisées à des fins d’espionnage").toLowerCase()),
 page4Actor:normalized(4).includes("apt28"),
 page4Cve:normalized(4).includes("cve-2023-23397"),
 page4CveStart:normalized(4).includes("mars 2022"),
 page4CveEnd:normalized(4).includes("juin 2023"),
 page15Recommendation10:/\bR10\b/.test(byPage(15)),
 page15Recommendation11:/\bR11\b/.test(byPage(15)),
 page16Recommendation12:/\bR12\b/.test(byPage(16)),
 page17Recommendation13:/\bR13\b/.test(byPage(17)),
 criticalPagesFreeOfPrivateUse:[3,4,15,16,17].every(n=>
  (quality.pageDiagnostics[n-1]?.privateUseCount??1)===0),
 completeText:quality.pagesWithoutText===0&&quality.pageCount===23,
 chunksPresent:chunks.length>0,
};
const trQuery=memorySearchQuery("Bu saldırıların stratejik amacı ne olabilir?",["APT28"]);
const report={
 reportId:"CERTFR-2023-CTI-009",sourceKind:"LOCAL_OFFICIAL_PDF_OPERATOR_FIXTURE",
 pdfSha256:sha,extractor:"pdfjs-dist/legacy/build/pdf.mjs",
 extractorVersion:packageInfo.version,declaredPageCount,
 extractionFingerprint:quality.extractionFingerprint,extractedChars:quality.totalExtractedChars,
 pages:quality.pageDiagnostics.map(({page,charCount,privateUseCount,sectionType,flags})=>({page,charCount,privateUseCount,sectionType,flags})),
 indexedChunkCount:chunks.length,chunkPages:[...new Set(chunks.map(c=>c.page_number))],
 scope:"FULL_DOCUMENT_LOCAL_EXTRACTION_ONLY",
 queryDiagnostics:{questionLanguage:"tr",lookupLanguage:"fr",hasSearchOnlyAlias:trQuery.includes("espionnage"),
  anchorPage:3,quoteCheck:gold.page3OriginalQuote,dbRetrieval:"NOT_RUN",modelEvaluation:"NOT_RUN"},
 gold,
 passed:Object.values(gold).every(Boolean),warnings:quality.flags,
 remediation:quality.flags.includes("PRIVATE_USE_GLYPHS")?
  "UNTRUSTED_GLYPHS: inspect ToUnicode/font encoding; cross-check independent local extractor or local OCR against rendered PDF; never guess digits.":
  null,
};
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
