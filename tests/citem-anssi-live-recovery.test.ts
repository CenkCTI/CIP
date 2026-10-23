// @vitest-environment node
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {extractPdfPages} from "@/lib/ai/stage3/pdf-text";
import {hasPrivatePdfTextGlyphs} from "@/lib/ai/stage3/pdf-recovery";

const live=Boolean(process.env.CITEM_ANSSI_PDF_PATH);
describe.skipIf(!live)("ANSSI official PDF end-to-end source extraction on GitHub runner",()=>{
 it("recovers CVE-2023-23397 and 2022-2023 range from the original bytes",async()=>{
  expect(process.env.CITEM_PDF_POPPLER_ENABLED).toBe("1");
  const bytes=readFileSync(process.env.CITEM_ANSSI_PDF_PATH!);
  expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
  const extracted=await extractPdfPages(Uint8Array.from(bytes).buffer,[4,15,16,17],{
    maxDocumentPages:200,maxDocumentChars:500_000,
  });
  expect(extracted.map(x=>x.page)).toEqual([4,15,16,17]);
  const text=(page:number)=>extracted.find(x=>x.page===page)!.text;
  const normalized=(page:number)=>text(page).normalize("NFKC")
    .replace(/\s+/g," ").toLocaleLowerCase("fr");
  expect(normalized(4)).toContain("cve-2023-23397");
  expect(normalized(4)).toContain("mars 2022");
  expect(normalized(4)).toContain("juin 2023");
  expect(/\br10\b/.test(normalized(15))).toBe(true);
  expect(/\br11\b/.test(normalized(15))).toBe(true);
  expect(/\br12\b/.test(normalized(16))).toBe(true);
  expect(/\br13\b/.test(normalized(17))).toBe(true);
  for(const item of extracted)expect(hasPrivatePdfTextGlyphs(item.text)).toBe(false);
 });
});
