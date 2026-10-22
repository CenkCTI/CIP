import "server-only";
import { isIP } from "node:net";
import { Agent,request } from "undici";
import { createPinnedLookup,resolvePublic } from "@/lib/research-feeds/network";
import { extractPdfPages } from "@/lib/ai/stage3/pdf-text";
import type { ReadWebPage } from "./types";

export class WebReadError extends Error {
  constructor(public code:
    "web_url_blocked"|"web_dns_blocked"|"web_timeout"|"web_fetch_failed"|
    "web_content_unsupported"|"web_too_large"|"web_redirect_blocked"|
    "web_no_text"){super(code);}
}
const blocked=/^(?:localhost|.*\.(?:local|localhost|internal|test|invalid|onion)|metadata\.google\.internal)$/i;
/** Fail closed even before DNS. Each request, including redirects, revalidates DNS. */
export function safeWebUrl(value:string):URL{
  if(value.length>2048||/[\u0000-\u001f\u007f]/.test(value)||/%25|%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value))
    throw new WebReadError("web_url_blocked");
  let url:URL;try{url=new URL(value);}catch{throw new WebReadError("web_url_blocked");}
  const host=url.hostname.toLowerCase().replace(/\.$/,"");
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !host.includes(".")||blocked.test(host)||host.includes("%")||isIP(host.replace(/^\[|\]$/g,""))||
     host.length>253)throw new WebReadError("web_url_blocked");
  url.hostname=host;
  return url;
}
function decodeEntities(value:string){
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27);/gi,m=>{
    const key=m.toLowerCase();
    return key==="&amp;"?"&":key==="&lt;"?"<":key==="&gt;"?">":
      key==="&quot;"?'"':key==="&nbsp;"?" ":key==="&apos;"||key==="&#39;"||key==="&#x27;"?"'":m;
  });
}
/** Deterministic extraction, never run arbitrary page JavaScript. */
export function htmlToText(input:string){
  return decodeEntities(input
    .replace(/<!--[\s\S]*?-->/g," ")
    .replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi," ")
    .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote)>/gi,"\n")
    .replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim()).slice(0,12000);
}
export async function readPublicWebPage(rawUrl:string):Promise<ReadWebPage>{
  let current=safeWebUrl(rawUrl);
  const abort=new AbortController();
  const timeout=setTimeout(()=>abort.abort(),11000);
  const seen=new Set<string>();
  try{
    for(let redirects=0;redirects<=3;redirects++){
      if(seen.has(current.href))throw new WebReadError("web_redirect_blocked");
      seen.add(current.href);
      let address:{address:string;family:number};
      try{address=await resolvePublic(current.hostname,abort.signal);}
      catch{throw new WebReadError("web_dns_blocked");}
      const dispatcher=new Agent({connect:{
        timeout:3000,servername:current.hostname,lookup:createPinnedLookup(address),
      }});
      let bodyToDispose:{destroy:()=>void}|null=null;
      try{
        const res=await request(current,{
          dispatcher,method:"GET",
          headers:{"user-agent":"CITEM-ResearchReader/1.0",
            "accept":"text/html,text/plain,application/pdf",
            "accept-encoding":"identity"},
          headersTimeout:5000,signal:abort.signal,
        });
        bodyToDispose=res.body;
        if([301,302,303,307,308].includes(res.statusCode)){
          if(redirects>=3)throw new WebReadError("web_redirect_blocked");
          const target=res.headers.location;
          if(typeof target!=="string")throw new WebReadError("web_redirect_blocked");
          let next:URL;
          try{next=safeWebUrl(new URL(target,current).toString());}
          catch{throw new WebReadError("web_redirect_blocked");}
          res.body.destroy();
          current=next;
          continue;
        }
        if(res.statusCode!==200)throw new WebReadError("web_fetch_failed");
        const encoding=String(res.headers["content-encoding"]??"").toLowerCase();
        if(encoding && encoding!=="identity")throw new WebReadError("web_content_unsupported");
        const mime=String(res.headers["content-type"]??"").split(";")[0].trim().toLowerCase();
        if(mime!=="text/html"&&mime!=="text/plain"&&mime!=="application/pdf")
          throw new WebReadError("web_content_unsupported");
        const max=mime==="application/pdf"?2_000_000:650_000;
        if(Number(res.headers["content-length"]??0)>max)throw new WebReadError("web_too_large");
        const blocks:Buffer[]=[];
        let size=0;
        for await(const chunk of res.body){
          const part=Buffer.from(chunk);
          size+=part.byteLength;
          if(size>max)throw new WebReadError("web_too_large");
          blocks.push(part);
        }
        const bytes=Buffer.concat(blocks);
        let text:string;
        let title=current.hostname;
        if(mime==="application/pdf"){
          try{
            const pdf=Uint8Array.from(bytes).buffer;
            const pages=await extractPdfPages(pdf,"all",{
              maxDocumentPages:100,maxDocumentChars:45000});
            text=pages.map(p=>"[PDF page "+p.page+"] "+p.text).join("\n").slice(0,12000);
          }catch{throw new WebReadError("web_content_unsupported");}
        }else{
          const body=bytes.toString("utf8");
          if(mime==="text/html"){
            const t=body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
            if(t)title=decodeEntities(t[1].replace(/<[^>]*>/g," ")).trim().slice(0,240)||title;
            text=htmlToText(body);
          }else text=body.replace(/\s+/g," ").trim().slice(0,12000);
        }
        if(text.length<40)throw new WebReadError("web_no_text");
        return {url:current.toString(),title,domain:current.hostname,
          contentType:mime,retrievedAt:new Date().toISOString(),text};
      }finally{
        // Unconsumed error/redirect responses must not keep connections alive.
        bodyToDispose?.destroy();
        await dispatcher.close();
      }
    }
    throw new WebReadError("web_redirect_blocked");
  }catch(error){
    if(error instanceof WebReadError)throw error;
    if(abort.signal.aborted)throw new WebReadError("web_timeout");
    throw new WebReadError("web_fetch_failed");
  }finally{clearTimeout(timeout);}
}
