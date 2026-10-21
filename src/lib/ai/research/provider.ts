import "server-only";
import type { ResearchSearchResult } from "./types";

/** Replaceable server-only search provider contract. NVIDIA inference is NOT a search engine. */
export interface ResearchSearchProvider{
  search(query:string):Promise<ResearchSearchResult[]>;
}
export class ResearchGatewayError extends Error{
  constructor(public code:"search_not_configured"|"search_unavailable"|"search_rate_limited"|"search_invalid_response"){
    super(code);
  }
}
type BraveResult={title?:unknown;url?:unknown;description?:unknown;
  age?:unknown;page_age?:unknown;meta_url?:{hostname?:unknown}};
export function normalizeSearchResult(raw:BraveResult,query:string):ResearchSearchResult|null{
  if(typeof raw.url!=="string"||typeof raw.title!=="string")return null;
  try{
    const u=new URL(raw.url);
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
       u.hostname.length>253||u.hostname==="localhost")return null;
    const domain=u.hostname.toLowerCase();
    if(!domain.includes(".")||/[\r\n]/.test(raw.title))return null;
    return {url:u.toString(),title:raw.title.slice(0,240),
      domain, publisher:domain,
      snippet:typeof raw.description==="string"?raw.description.replace(/<[^>]*>/g," ").slice(0,500):"",
      publishedAt:null,query};
  }catch{return null;}
}
export class BraveResearchProvider implements ResearchSearchProvider{
  constructor(private key:string){}
  async search(query:string){
    const endpoint=new URL("https://api.search.brave.com/res/v1/web/search");
    endpoint.searchParams.set("q",query);
    endpoint.searchParams.set("count","6");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),9000);
    try{
      const response=await fetch(endpoint,{headers:{"accept":"application/json",
        "x-subscription-token":this.key},signal:controller.signal,
        redirect:"error",cache:"no-store"});
      if(response.status===429)throw new ResearchGatewayError("search_rate_limited");
      if(!response.ok)throw new ResearchGatewayError("search_unavailable");
      const bytes=Number(response.headers.get("content-length")??0);
      if(bytes>180000)throw new ResearchGatewayError("search_invalid_response");
      const bodyText=await response.text();
      if(bodyText.length>180000)throw new ResearchGatewayError("search_invalid_response");
      const json=JSON.parse(bodyText) as {web?:{results?:BraveResult[]}};
      if(!Array.isArray(json.web?.results))throw new ResearchGatewayError("search_invalid_response");
      return json.web.results.slice(0,8).map(result=>normalizeSearchResult(result,query))
        .filter((result):result is ResearchSearchResult=>result!==null).slice(0,6);
    }catch(e){
      if(e instanceof ResearchGatewayError)throw e;
      throw new ResearchGatewayError("search_unavailable");
    }finally{clearTimeout(timeout);}
  }
}
export function getResearchProvider():ResearchSearchProvider{
  const key=process.env.BRAVE_SEARCH_API_KEY;
  if(!key)throw new ResearchGatewayError("search_not_configured");
  return new BraveResearchProvider(key);
}
