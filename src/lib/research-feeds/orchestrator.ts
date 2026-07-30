import "server-only";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { FeedError, safeFeedMessage, type FeedErrorCode } from "./errors";
import { itemFingerprints } from "./fingerprint";
import { fetchFeed } from "./network";
import { parseFeed } from "./parser";

export async function ingestStoredResearchFeed(projectId:string,feedId:string) {
 const ctx=await requireOwnedProject(projectId); const {data:source,error}=await ctx.supabase.from("research_feed_sources").select("id,configured_url,etag,last_modified").eq("project_id",projectId).eq("id",feedId).single();if(error||!source)return{error:"Feed not found."};
 const {data:run,error:claimError}=await ctx.supabase.rpc("claim_research_feed_fetch",{p_project_id:projectId,p_feed_source_id:feedId});if(claimError||!run)return{error:mapRpcError(claimError?.message)};
 try {const response=await fetchFeed(source.configured_url,{etag:source.etag,lastModified:source.last_modified});let type:"UNKNOWN"|"RSS"|"ATOM"="UNKNOWN";let items:Record<string,unknown>[]=[];if(response.status===200){const parsed=parseFeed(response.body,response.finalUrl);type=parsed.type;items=parsed.items.map(i=>{const f=itemFingerprints(i);return{external_id:i.externalId,title:i.title,canonical_url:i.canonicalUrl,summary_text:i.summaryText,content_text:i.contentText,author_name:i.authorName,published_at:i.publishedAt,source_updated_at:i.sourceUpdatedAt,language:i.language,categories:i.categories,url_hash:f.url,content_hash:f.content};});}
  const {error:completeError}=await ctx.supabase.rpc("complete_research_feed_fetch",{p_project_id:projectId,p_feed_source_id:feedId,p_run_id:run.id,p_status:response.status===304?"NOT_MODIFIED":"SUCCEEDED",p_feed_type:type,p_final_url:response.finalUrl,p_http_status:response.status,p_response_bytes:response.bytes,p_etag:String(response.headers.etag??"")||null,p_last_modified:String(response.headers["last-modified"]??"")||null,p_items:items});if(completeError)throw new FeedError("INTERNAL_ERROR");return{success:response.status===304?"Feed checked; content was not modified.":`Feed fetched; ${items.length} items processed.`};
 }catch(e){const code=e instanceof FeedError?e.code:"INTERNAL_ERROR";await ctx.supabase.rpc("fail_research_feed_fetch",{p_project_id:projectId,p_feed_source_id:feedId,p_run_id:run.id,p_error_code:code,p_error_message:safeFeedMessage(code)});return{error:safeFeedMessage(code)};}
}
function mapRpcError(message=""){for(const code of ["FEED_DISABLED","FEED_ARCHIVED","FETCH_ALREADY_RUNNING","FETCH_COOLDOWN"] as FeedErrorCode[])if(message.includes(code))return safeFeedMessage(code);return "Feed not found.";}
