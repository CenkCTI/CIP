import { requireUser } from "@/lib/auth";
import { OsintWorkspace } from "@/components/osint/osint-workspace";

export default async function OsintPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const query=await searchParams;
  const mode=["all","unread","saved","dismissed"].includes(query.mode??"")?query.mode!:"all";
  const search=(query.q??"").trim().slice(0,200);
  const {supabase}=await requireUser();
  let request=supabase.from("research_items").select("id,title,summary_text,canonical_url,published_at,first_seen_at,categories,osint_item_states(read_at,saved_at,dismissed_at),research_feed_item_observations(feed_source_id,research_feed_sources(name))").order("published_at",{ascending:false,nullsFirst:false}).order("id",{ascending:false}).limit(30);
  if(search) request=request.textSearch("search_vector",search,{type:"websearch"});
  const [{data:items},{data:feeds},{data:projects}]=await Promise.all([request,supabase.from("research_feed_sources").select("id,name,description,enabled,scheduler_enabled,fetch_interval_minutes,next_scheduled_fetch_at,detected_feed_type,health_status,last_checked_at,last_success_at,last_error_message,archived_at").order("name").limit(100),supabase.from("projects").select("id,name").order("name").limit(100)]);
  return <OsintWorkspace initialItems={(items??[]) as never[]} feeds={(feeds??[]) as never[]} projects={(projects??[]) as never[]} mode={mode} search={search}/>;
}
