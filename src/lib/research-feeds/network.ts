import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { Agent, request } from "undici";
import { FeedError } from "./errors";
import { normalizeFeedUrl } from "./url";

export const NETWORK_LIMITS={connectMs:3000,headersMs:5000,totalMs:10000,maxBytes:5*1024*1024,maxRedirects:3} as const;
export type Resolver=(host:string)=>Promise<{address:string;family:number}[]>;
export function isPublicAddress(value:string) { try { const a=ipaddr.process(value); return a.range()==="unicast"; } catch { return false; } }
export async function resolvePublic(host:string,resolver:Resolver=async h=>dnsLookup(h,{all:true})) { let answers; try { answers=await resolver(host); } catch { throw new FeedError("DNS_FAILED"); } if (!answers.length || answers.some(a=>!isPublicAddress(a.address))) throw new FeedError("DNS_BLOCKED"); return answers[0]!; }
type Transport=(url:URL,address:{address:string;family:number},headers:Record<string,string>,signal:AbortSignal)=>Promise<{status:number;headers:Record<string,string|string[]|undefined>;body:AsyncIterable<Uint8Array>}>;
const transport:Transport=async(url,address,headers,signal)=>{
  const dispatcher=new Agent({connect:{timeout:NETWORK_LIMITS.connectMs,servername:url.hostname,lookup:(_h,_o,cb)=>cb(null,address.address,address.family)}});
  try { const r=await request(url,{dispatcher,method:"GET",headers,signal,headersTimeout:NETWORK_LIMITS.headersMs}); return {status:r.statusCode,headers:r.headers,body:r.body}; } catch(e) { await dispatcher.close(); throw e; }
};
export async function fetchFeed(storedUrl:string, conditional:{etag?:string|null;lastModified?:string|null}={},deps:{resolver?:Resolver;transport?:Transport}={}) {
  let current=normalizeFeedUrl(storedUrl); const visited=new Set<string>(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),NETWORK_LIMITS.totalMs);
  try { for(let redirects=0;;redirects++) { if(visited.has(current.href)) throw new FeedError("REDIRECT_BLOCKED"); visited.add(current.href); const address=await resolvePublic(current.hostname,deps.resolver); const headers:Record<string,string>={"user-agent":"CITEM-Research-Feed/1.0","accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.2"};
      if(conditional.etag && conditional.etag.length<=512 && !/[\r\n]/.test(conditional.etag)) headers["if-none-match"]=conditional.etag;
      if(conditional.lastModified && conditional.lastModified.length<=128 && !/[\r\n]/.test(conditional.lastModified)) headers["if-modified-since"]=conditional.lastModified;
      let response; try { response=await (deps.transport??transport)(current,address,headers,controller.signal); } catch { if(controller.signal.aborted) throw new FeedError("REQUEST_TIMEOUT"); throw new FeedError("INTERNAL_ERROR"); }
      if([301,302,303,307,308].includes(response.status)) { if(redirects>=NETWORK_LIMITS.maxRedirects) throw new FeedError("TOO_MANY_REDIRECTS"); const location=String(response.headers.location??""); let next; try { next=normalizeFeedUrl(new URL(location,current).toString()); } catch { throw new FeedError("REDIRECT_BLOCKED"); } if(current.protocol==="https:"&&next.protocol==="http:") throw new FeedError("REDIRECT_BLOCKED"); current=next; continue; }
      if(response.status===304) return {status:304 as const,finalUrl:current.toString(),bytes:0,body:"",headers:response.headers}; if(response.status!==200) throw new FeedError("HTTP_ERROR");
      const type=String(response.headers["content-type"]??"").split(";")[0]!.trim().toLowerCase(); if(!["application/rss+xml","application/atom+xml","application/xml","text/xml","text/plain"].includes(type)) throw new FeedError("CONTENT_TYPE_REJECTED"); const length=Number(response.headers["content-length"]??0); if(length>NETWORK_LIMITS.maxBytes) throw new FeedError("RESPONSE_TOO_LARGE"); const chunks:Buffer[]=[];let size=0; for await(const chunk of response.body){size+=chunk.byteLength;if(size>NETWORK_LIMITS.maxBytes)throw new FeedError("RESPONSE_TOO_LARGE");chunks.push(Buffer.from(chunk));} const body=Buffer.concat(chunks).toString("utf8"); if(!body.trim())throw new FeedError("EMPTY_RESPONSE"); if(type==="text/plain"&&!body.trimStart().startsWith("<"))throw new FeedError("CONTENT_TYPE_REJECTED"); return {status:200 as const,finalUrl:current.toString(),bytes:size,body,headers:response.headers};
    }} finally { clearTimeout(timer); }
}
