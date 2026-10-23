import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {PdfPageText} from "./pdf-recovery";

const run=promisify(execFile);

/**
 * Opt-in local OCR of rasterized original PDF pages (never the corrupted
 * Unicode layer). Requires trusted pdftoppm and Tesseract/fra on the worker.
 * This is NOT available by default on Vercel.
 */
export async function tryExtractPdfWithOcr(
 bytes:Uint8Array,corruptPageNumbers:number[],pageCount:number,
):Promise<PdfPageText[]|null>{
 if(process.env.CITEM_PDF_OCR_ENABLED!=="1")return null;
 if(pageCount<1||pageCount>200||bytes.byteLength>50*1024*1024)return null;
 const numbers=[...new Set(corruptPageNumbers)];
 // A synchronous request must not spend unbounded CPU on OCR; use a
 // separate worker for documents exceeding this bound.
 if(numbers.length===0||numbers.length>24||
    numbers.some(p=>!Number.isInteger(p)||p<1||p>pageCount))return null;
 const dir=await mkdtemp(join(tmpdir(),"citem-pdf-ocr-"));
 try{
   const source=join(dir,"original.pdf");
   await writeFile(source,bytes,{mode:0o600});
   const pages:PdfPageText[]=[];
   for(const page of numbers){
     const target=join(dir,"page-"+page);
     await run("pdftoppm",[
       "-f",String(page),"-l",String(page),
       "-r","200","-png","-singlefile",source,target,
     ],{timeout:15000,maxBuffer:8192,windowsHide:true});
     const png=await readFile(target+".png");
     if(png.length===0||png.length>16*1024*1024)return null;
     const {stdout}=await run("tesseract",[
       target+".png","stdout","-l","fra","--psm","3",
     ],{encoding:"utf8",timeout:20000,maxBuffer:350_000,windowsHide:true});
     const text=stdout.replace(/[ \t]+/g," ").trim();
     if(text.length<40)return null;
     pages.push({page,text});
   }
   return pages;
 }catch{
   // Missing OCR tools / unsupported document / timeout => retain source
   // integrity warnings rather than manufacturing clean text.
   return null;
 }finally{
   await rm(dir,{recursive:true,force:true}).catch(()=>{});
 }
}
