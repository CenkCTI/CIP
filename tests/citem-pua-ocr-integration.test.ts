// @vitest-environment node
import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {extractPdfPages} from "@/lib/ai/stage3/pdf-text";
import {hasPrivatePdfTextGlyphs} from "@/lib/ai/stage3/pdf-recovery";

const fixture=process.env.CITEM_PUA_PDF_PATH;
describe.skipIf(!fixture)("Rendered OCR fixes synthetic PDF private-use font mapping",()=>{
 it("uses same-byte OCR fallback where Poppler and PDF.js cannot decode the ToUnicode digits",async()=>{
  expect(process.env.CITEM_PDF_OCR_ENABLED).toBe("1");
  const bytes=readFileSync(fixture!);
  const recovered=await extractPdfPages(Uint8Array.from(bytes).buffer,[1]);
  expect(recovered).toHaveLength(1);
  const text=recovered[0].text.replace(/\s+/g," ");
  expect(text).toContain("CVE-2023-23397");
  expect(text).toContain("mars 2022");
  expect(text).toContain("juin 2023");
  for(const label of ["R10","R11","R12","R13"])expect(text).toContain(label);
  expect(hasPrivatePdfTextGlyphs(text)).toBe(false);
 });
});
