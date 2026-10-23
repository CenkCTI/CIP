#!/usr/bin/env node
// Independent local Poppler check of exact source identity; never logs raw PDF text.
// Usage: node scripts/citem-anssi-compare-extractors.mjs /path/to/CERTFR-2023-CTI-009.pdf
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const filename=process.argv[2];
if(!filename){console.error("Usage: node scripts/citem-anssi-compare-extractors.mjs <local-official-PDF>");process.exit(2);}
const file=readFileSync(filename);
if(file.length>50*1024*1024||file.subarray(0,5).toString()!=="%PDF-"){
 console.error("INVALID_PDF_OR_TOO_LARGE");process.exit(2);
}
const digest=createHash("sha256").update(file).digest("hex");
const normalized=text=>text.normalize("NFKC").replace(/\s+/g," ").toLocaleLowerCase("fr");
let pages={};
try{
 for(const n of [1,3,4,15,16,17]){
  const extracted=execFileSync("pdftotext",["-f",String(n),"-l",String(n),"-enc","UTF-8",filename,"-"],
   {encoding:"utf8",timeout:15000,maxBuffer:2*1024*1024,stdio:["ignore","pipe","pipe"]});
  pages[n]=normalized(extracted);
 }
}catch(error){
 console.error(JSON.stringify({error:"POPPLER_NOT_AVAILABLE_OR_FAILED",message:"Install poppler-utils locally and check PDF validity. No original was changed.",exitCode:error.status??null}));
 process.exit(2);
}
const checks={
 coverDate:pages[1].includes("26 octobre 2023"),
 page3Actor:pages[3].includes("apt28"),
 page3Purpose:pages[3].includes("espionnage"),
 page4Actor:pages[4].includes("apt28"),
 page4Vulnerability:pages[4].includes("cve-2023-23397"),
 page4Start:pages[4].includes("mars 2022"),
 page4End:pages[4].includes("juin 2023"),
 page15R10:/\br10\b/.test(pages[15]),
 page15R11:/\br11\b/.test(pages[15]),
 page16R12:/\br12\b/.test(pages[16]),
 page17R13:/\br13\b/.test(pages[17]),
};
const privateUse=/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;
const privateUseByPage=Object.fromEntries(Object.entries(pages).map(([page,text])=>[page,(text.match(privateUse)??[]).length]));
const passed=Object.values(checks).every(Boolean)&&Object.values(privateUseByPage).every(count=>count===0);
console.log(JSON.stringify({
 document:"CERTFR-2023-CTI-009",originalSha256:digest,
 extractor:"local-poppler-pdftotext",scope:"SELECTED_6_PAGES_DIAGNOSTIC_ONLY",
 checks,privateUseByPage,passed,
 nextStep:passed?
  "Compare human-verified rendered pages and PDF.js text. This is an independent candidate, NOT an active server extractor.":
  "Investigate font/ToUnicode, then try independently verified local OCR. No guessed substitutions.",
},null,2));
if(!passed)process.exitCode=1;
