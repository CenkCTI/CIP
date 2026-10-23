import {createHash} from "node:crypto";
import {assessDocumentTextQuality,normalizeForSearch,type SectionType,
  type QualityFlag} from "./document-quality";

/**
 * Phase A v1: changing PDF extraction/chunking semantics requires an explicit
 * index version bump. Existing 066/067 READY caches cannot be reused silently.
 */
export const CITEM_EXTRACTION_VERSION="pdfjs-5.4.296-poppler-ocr-a1";
export const CITEM_CHUNKING_VERSION="page-char-1800-overlap-180-v1";
export const CITEM_INDEX_VERSION="CITEM-PDF-INDEX-A1-20261023";
export type ExtractionEngine="pdfjs"|"poppler"|"ocr";
export type OriginalPage={page:number;text:string;extractor:ExtractionEngine};
export type MetadataOrigin="UPLOAD_METADATA"|"EXTRACTED_TEXT"|"MODEL_SUGGESTION"|
  "ANALYST_APPROVED"|"OFFICIAL_EXTERNAL";
export type MetadataCandidate={
  field:"document_title"|"report_reference"|"publication_date"|"publisher"|"tlp_marking";
  value:string;origin:MetadataOrigin;page:number|null;snippet:string|null;
  method:string;review_status:"CANDIDATE"|"APPROVED"|"REJECTED";
};
export type ExtractionPageSnapshot={
  page_number:number;original_text:string;search_text:string;original_text_sha256:string;
  extractor:ExtractionEngine;section_type:SectionType;quality_flags:QualityFlag[];
  char_count:number;
};
export type ExtractionManifest={
  extractor_version:string;index_version:string;chunking_version:string;
  extraction_fingerprint:string;document_language:"fr"|"en"|"tr"|"mixed"|"unknown";
  language_method:"heuristic_unverified";
  quality_status:"COMPLETE"|"REVIEW_REQUIRED";
  quality_flags:QualityFlag[];
  page_count:number;pages_with_text:number;pages_without_text:number;
  metadata_candidates:MetadataCandidate[];
  pages:ExtractionPageSnapshot[];
};

const sha=(text:string)=>createHash("sha256").update(text).digest("hex");

/** A valid page number/text is not optional; no claims of entire PDF on gaps. */
export function buildExtractionManifest(pages:OriginalPage[]):ExtractionManifest{
 if(!pages.length||pages.length>200||
   pages.some((p,i)=>p.page!==i+1||!p.text.trim()||
     p.text.length>50_000||
     !["pdfjs","poppler","ocr"].includes(p.extractor)))
   throw new Error("extraction_incomplete_or_invalid");
 const quality=assessDocumentTextQuality(pages);
 if(quality.pagesWithoutText!==0||
   quality.flags.includes("PAGE_SEQUENCE_INVALID")||
   quality.totalExtractedChars>500_000)
   throw new Error("extraction_incomplete_or_invalid");
 const mapped=pages.map((p,i)=>({
   page_number:p.page,original_text:p.text,search_text:normalizeForSearch(p.text),
   original_text_sha256:sha(p.text),extractor:p.extractor,
   section_type:quality.pageDiagnostics[i].sectionType,
   quality_flags:quality.pageDiagnostics[i].flags,
   char_count:p.text.length,
 }));
 // An OCR result may be legible but is not automatically an exact quotation.
 const needsReview=pages.some(p=>p.extractor==="ocr")||
   quality.flags.some(x=>x==="PRIVATE_USE_GLYPHS"||
     x==="REPLACEMENT_GLYPHS"||x==="CONTROL_CHARACTERS"||
     x==="LOW_TEXT_COVERAGE");
 return {
   extractor_version:CITEM_EXTRACTION_VERSION,
   index_version:CITEM_INDEX_VERSION,chunking_version:CITEM_CHUNKING_VERSION,
   extraction_fingerprint:quality.extractionFingerprint,
   document_language:quality.languageHint,language_method:quality.languageMethod,
   quality_status:needsReview?"REVIEW_REQUIRED":"COMPLETE",
   quality_flags:quality.flags,page_count:pages.length,
   pages_with_text:quality.pagesWithText,
   pages_without_text:quality.pagesWithoutText,
   metadata_candidates:[],
   pages:mapped,
 };
}

export function canPublishExtraction(manifest:ExtractionManifest):boolean{
 return manifest.quality_status==="COMPLETE"&&manifest.page_count>0&&
   manifest.pages_with_text===manifest.page_count&&manifest.pages_without_text===0&&
   manifest.pages.length===manifest.page_count&&
   manifest.pages.every((p,i)=>p.page_number===i+1&&
     p.extractor!=="ocr"&&p.quality_flags.length===0&&
     p.original_text_sha256===sha(p.original_text));
}
