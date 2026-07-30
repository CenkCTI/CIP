/* eslint-disable @typescript-eslint/no-explicit-any */
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { FeedError } from "./errors";
import { normalizeItemUrl } from "./url";
export type NormalizedResearchItem={externalId:string|null;title:string|null;canonicalUrl:string|null;summaryText:string|null;contentText:string|null;authorName:string|null;publishedAt:string|null;sourceUpdatedAt:string|null;categories:string[];language:string|null};
const text=(v:unknown,max:number)=>{if(v==null)return null;const s=String(typeof v==="object"?(v as Record<string,unknown>)["#text"]??"":v).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<object[\s\S]*?<\/object>|<[^>]+>/gi," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();return s?s.slice(0,max):null;};
const date=(v:unknown)=>{const s=text(v,100);if(!s)return null;const n=Date.parse(s);return Number.isNaN(n)?null:new Date(n).toISOString();}; const arr=<T>(v:T|T[]|undefined):T[]=>v==null?[]:Array.isArray(v)?v:[v];
export function parseFeed(xml:string,baseUrl:string,maxItems=500):{type:"RSS"|"ATOM";items:NormalizedResearchItem[]} {
  if(/<!DOCTYPE|<!ENTITY|<\s*xinclude\b/i.test(xml))throw new FeedError("XML_UNSAFE"); if(XMLValidator.validate(xml)!==true)throw new FeedError("XML_INVALID");
  // Preserve-order parsing provides a parser-native tree for deterministic limits, including
  // Unicode/namespaced names, comments, CDATA, siblings, and correctly validated nesting.
  let ordered:unknown;try{ordered=new XMLParser({preserveOrder:true,ignoreAttributes:false}).parse(xml);}catch{throw new FeedError("XML_INVALID");}
  let nodes=0;const walk=(value:unknown,depth:number)=>{if(depth>40)throw new FeedError("XML_UNSAFE");if(Array.isArray(value)){for(const child of value)walk(child,depth);return;}if(value&&typeof value==="object"){for(const [key,child] of Object.entries(value)){if(!key.startsWith(":")){nodes++;if(nodes>100000)throw new FeedError("XML_UNSAFE");}walk(child,depth+1);}}};walk(ordered,0);
  let root:Record<string,any>;try{root=new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",trimValues:true}).parse(xml);}catch{throw new FeedError("XML_INVALID");}
  let type:"RSS"|"ATOM",raw:any[];if(root.rss?.channel){type="RSS";raw=arr(root.rss.channel.item);}else if(root.feed){type="ATOM";raw=arr(root.feed.entry);}else throw new FeedError("FEED_UNSUPPORTED");
  const items=raw.slice(0,maxItems).map((x:any):NormalizedResearchItem=>{const links=arr(x.link);const link=type==="ATOM"?(links.find((l:any)=>l?.["@_rel"]==="alternate")??links[0])?.["@_href"]:text(x.link,4096);const title=text(x.title,500),summary=text(x.description??x.summary,20000),content=text(x["content:encoded"]??x.content,100000);return{externalId:text(x.guid??x.id,1000),title,canonicalUrl:normalizeItemUrl(link?String(link):null,baseUrl),summaryText:summary,contentText:content,authorName:text(x.author?.name??x.author??x["dc:creator"],500),publishedAt:date(x.pubDate??x.published),sourceUpdatedAt:date(x.updated),categories:[...new Set(arr(x.category).map(c=>text(typeof c==="object"?(c as any)["@_term"]??c:c,100)).filter(Boolean) as string[])].slice(0,50),language:text(x.language??root.feed?.["@_xml:lang"],50)}}).filter(i=>i.title||i.summaryText||i.contentText);return{type,items};
}
