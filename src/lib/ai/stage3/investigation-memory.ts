import "server-only";
import type { requireOwnedProject } from "@/lib/projects/ownership";

type Owned = Awaited<ReturnType<typeof requireOwnedProject>>;
type MemoryRow = {
  id:string;question:string;context:unknown;result:unknown;web_research:boolean;created_at:string;
};
export class CopilotMemoryError extends Error {
  constructor(){super("copilot_memory_unavailable");}
}
async function findProfile(owned:Owned,sourceId:string,assetId:string){
  const {data,error}=await owned.supabase.from("copilot_memory_profiles")
    .select("id,notes").eq("project_id",owned.projectId)
    .eq("source_id",sourceId).eq("asset_id",assetId)
    .eq("owner_id",owned.user.id).maybeSingle();
  if(error)throw new CopilotMemoryError();
  return data as {id:string;notes:string}|null;
}
export async function readInvestigationMemory(owned:Owned,sourceId:string,assetId:string){
  const profile=await findProfile(owned,sourceId,assetId);
  if(!profile)return {profileId:null as string|null,notes:"",turns:[] as MemoryRow[]};
  const {data,error}=await owned.supabase.from("copilot_memory_turns")
    .select("id,question,context,result,web_research,created_at")
    .eq("project_id",owned.projectId).eq("profile_id",profile.id)
    .eq("owner_id",owned.user.id).order("created_at",{ascending:false}).limit(40);
  if(error)throw new CopilotMemoryError();
  return {profileId:profile.id,notes:profile.notes,turns:(data??[]) as MemoryRow[]};
}
/** Only bounded conversational hints; never treat previous AI answers as verified evidence. */
export function selectMemoryHints(turns:MemoryRow[],question:string){
  const terms=(question.toLocaleLowerCase("tr-TR").match(/[\p{L}\p{N}]{4,}/gu)??[]).slice(0,12);
  const ranked=turns.map((turn,index)=>{
    const haystack=(turn.question+" "+JSON.stringify(turn.result).slice(0,600)).toLocaleLowerCase("tr-TR");
    return {turn,index,score:terms.reduce((n,term)=>n+(haystack.includes(term)?1:0),0)};
  }).sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected=[...ranked.slice(0,5),...turns.slice(0,2).map((turn,index)=>({turn,index,score:0}))];
  const used=new Set<string>();
  return selected.filter(x=>{if(used.has(x.turn.id))return false;used.add(x.turn.id);return true;})
    .slice(0,6).reverse().map(({turn})=>({
      question:turn.question.slice(0,350),
      previous_ai_response:typeof (turn.result as {summary?:unknown})?.summary==="string"
        ?(turn.result as {summary:string}).summary.slice(0,650):"",
    }));
}
async function ensureProfile(owned:Owned,sourceId:string,assetId:string){
  const current=await findProfile(owned,sourceId,assetId);
  if(current)return current.id;
  const {error}=await owned.supabase.from("copilot_memory_profiles").upsert({
    project_id:owned.projectId,source_id:sourceId,asset_id:assetId,owner_id:owned.user.id,
  },{onConflict:"project_id,source_id,asset_id,owner_id",ignoreDuplicates:true});
  if(error)throw new CopilotMemoryError();
  const created=await findProfile(owned,sourceId,assetId);
  if(!created)throw new CopilotMemoryError();
  return created.id;
}
export async function saveInvestigationTurn(owned:Owned,sourceId:string,assetId:string,
  question:string,context:object,result:object,webResearch:boolean){
  const profileId=await ensureProfile(owned,sourceId,assetId);
  const {error}=await owned.supabase.from("copilot_memory_turns").insert({
    project_id:owned.projectId,profile_id:profileId,owner_id:owned.user.id,
    question,mode:"analyst",context,result,web_research:webResearch,
  });
  if(error)throw new CopilotMemoryError();
}
export async function updateInvestigationNotes(owned:Owned,sourceId:string,assetId:string,notes:string){
  const profileId=await ensureProfile(owned,sourceId,assetId);
  const {error}=await owned.supabase.from("copilot_memory_profiles")
    .update({notes}).eq("id",profileId).eq("project_id",owned.projectId)
    .eq("owner_id",owned.user.id);
  if(error)throw new CopilotMemoryError();
}
export async function clearInvestigationTurns(owned:Owned,sourceId:string,assetId:string){
  const profile=await findProfile(owned,sourceId,assetId);
  if(!profile)return;
  const {error}=await owned.supabase.from("copilot_memory_turns").delete()
    .eq("project_id",owned.projectId).eq("profile_id",profile.id).eq("owner_id",owned.user.id);
  if(error)throw new CopilotMemoryError();
}
