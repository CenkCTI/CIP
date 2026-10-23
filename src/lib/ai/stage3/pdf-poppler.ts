import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {PdfPageText} from "./pdf-recovery";
const execute=promisify(execFile);
/** Explicit opt-in local binary; never a shell or external service. */
export async function tryExtractPdfWithPoppler(bytes:Uint8Array,pageCount:number):Promise<PdfPageText[]|null>{
 if(process.env.CITEM_PDF_POPPLER_ENABLED!=="1")return null;
 if(pageCount<1||pageCount>200||bytes.length>50*1024*1024)return null;
 const dir=await mkdtemp(join(tmpdir(),"citem-pdf-"));
 try{
  const source=join(dir,"source.pdf");
  await writeFile(source,bytes,{mode:0o600});
  const {stdout}=await execute("pdftotext",["-enc","UTF-8",source,"-"],{
   encoding:"utf8",timeout:20000,maxBuffer:3_000_000,windowsHide:true,
  });
  const texts=stdout.split("\f");
  if(texts.at(-1)?.trim()==="")texts.pop();
  if(texts.length!==pageCount)return null;
  return texts.map((text,i)=>({page:i+1,text:text.replace(/[ \t]+/g," ").trim()}));
 }catch{return null;}
 finally{await rm(dir,{recursive:true,force:true}).catch(()=>{});}
}
