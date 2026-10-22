import {readPublicWebPage,WebReadError} from "./safe-fetch";
import type {ReadWebPage} from "./types";

export type SkippedComparisonSource={
  url:string;
  reason:"unavailable"|"timeout"|"unsupported"|"too_large"|"no_text";
};
export type ComparisonPageLoad={
  pages:ReadWebPage[];
  skippedSources:SkippedComparisonSource[];
};

/**
 * Preserve the analyst's intent and continue with readable pages. Unsafe URLs,
 * private DNS and blocked redirects are security failures, never downgraded to
 * a recoverable site failure. All unsuccessful URLs remain explicitly visible.
 */
export async function loadSelectedComparisonPages(
  urls:readonly string[],
  reader:(url:string)=>Promise<ReadWebPage>=readPublicWebPage,
):Promise<ComparisonPageLoad>{
  const settled=await Promise.allSettled(urls.map(url=>reader(url)));
  const pages:ReadWebPage[]=[];
  const skippedSources:SkippedComparisonSource[]=[];
  for(let i=0;i<settled.length;i++){
    const result=settled[i];
    if(result.status==="fulfilled"){
      pages.push({...result.value,text:result.value.text.slice(0,8000)});
      continue;
    }
    const err=result.reason;
    if(!(err instanceof WebReadError))throw err; // never hide implementation failures
    if(err.code==="web_url_blocked"||err.code==="web_dns_blocked"||
       err.code==="web_redirect_blocked")throw err; // fail closed
    const reason:SkippedComparisonSource["reason"]=
      err.code==="web_timeout"?"timeout":
      err.code==="web_content_unsupported"?"unsupported":
      err.code==="web_too_large"?"too_large":
      err.code==="web_no_text"?"no_text":"unavailable";
    skippedSources.push({url:urls[i],reason});
  }
  return {pages,skippedSources};
}
