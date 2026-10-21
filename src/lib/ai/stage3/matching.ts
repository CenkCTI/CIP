import "server-only";
import type { requireOwnedProject } from "@/lib/projects/ownership";
import { validateObservedIndicator } from "@/lib/cti/indicators";
import type { Stage3Candidate } from "./candidates";

type OwnedContext = Awaited<ReturnType<typeof requireOwnedProject>>;
export type ExistingCandidateMatch = {id:string;label:string;matchType:"EXACT"|"POSSIBLE"};
type Result = {matches:ExistingCandidateMatch[];matchStatus:"CHECKED"|"UNAVAILABLE"};

// Prevent literal source/model strings from introducing LIKE wildcards.
const literalLike = (s:string) => s.replace(/[\\%_]/g, "\\$&");
function words(input:string) {
  const stop=new Set(["about","after","before","could","from","have","into","their",
    "there","these","those","which","while","where","were","with","reported",
    "reporting","source","that","this","they","using","used"]);
  return new Set((input.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
    .filter((word)=>!stop.has(word)));
}
function similarity(a:Set<string>,b:Set<string>):number {
  if(!a.size||!b.size)return 0;
  const common=[...a].filter((word)=>b.has(word)).length;
  return common>=2?common/Math.max(a.size,b.size):0;
}

/** All lookups are project-scoped, bounded, read-only and never sent to NVIDIA. */
export async function findExistingCandidateMatches(owned:OwnedContext,candidate:Stage3Candidate):Promise<Result>{
  if(candidate.kind==="ATTRIBUTION_CLAIM"||candidate.kind==="UNANSWERED_QUESTION"||
    candidate.kind==="TIMELINE")return {matches:[],matchStatus:"CHECKED"};

  if(candidate.kind==="SOURCE_CLAIM"){
    const terms=words(candidate.claim);
    const anchor=[...terms].sort((a,b)=>b.length-a.length||a.localeCompare(b))[0];
    if(!anchor)return {matches:[],matchStatus:"CHECKED"};
    const {data,error}=await owned.supabase.from("source_claims")
      .select("id,claim_summary").eq("project_id",owned.projectId)
      .ilike("claim_summary",`%${literalLike(anchor)}%`).limit(25);
    if(error)return {matches:[],matchStatus:"UNAVAILABLE"};
    const text=candidate.claim.normalize("NFKC").toLowerCase().trim();
    const ranked=(data??[])
      .filter((row)=>typeof row.id==="string"&&typeof row.claim_summary==="string")
      .map((row)=>{
        const label=String(row.claim_summary);
        const matchType:"EXACT"|"POSSIBLE"=label.normalize("NFKC").toLowerCase().trim()===text?"EXACT":"POSSIBLE";
        return {id:String(row.id),label:label.slice(0,180),matchType,score:similarity(terms,words(label))};
      })
      .filter((item)=>item.matchType==="EXACT"||item.score>=0.5)
      .sort((a,b)=>Number(b.matchType==="EXACT")-Number(a.matchType==="EXACT")||
        b.score-a.score||a.id.localeCompare(b.id))
      .slice(0,5);
    return {matches:ranked.map(({score:_score,...record})=>record),matchStatus:"CHECKED"};
  }
  let table:"indicators"|"cves"|"mitre_techniques"|"malware"|"threat_actors"|"campaigns";
  let column:string,value:string,nameMatch=false;
  let extra:{column:string;value:string}|null=null;
  switch(candidate.kind){
    case "INDICATOR":{
      const checked=validateObservedIndicator({value:candidate.value,type:candidate.indicatorType});
      if(!checked.valid)return {matches:[],matchStatus:"CHECKED"};
      table="indicators";column="normalized_value";value=checked.canonical;
      extra={column:"type",value:candidate.indicatorType};break;
    }
    case "CVE":table="cves";column="cve_id";value=candidate.cveId.toUpperCase();break;
    case "MITRE":table="mitre_techniques";column="technique_id";value=candidate.techniqueId.toUpperCase();break;
    case "MALWARE":table="malware";column="name";value=candidate.name;nameMatch=true;break;
    case "THREAT_ACTOR":table="threat_actors";column="name";value=candidate.name;nameMatch=true;break;
    case "CAMPAIGN":table="campaigns";column="name";value=candidate.name;nameMatch=true;break;
  }
  let query=owned.supabase.from(table).select("id").eq("project_id",owned.projectId);
  query=nameMatch?query.ilike(column,literalLike(value)):query.eq(column,value);
  if(extra)query=query.eq(extra.column,extra.value);
  const {data,error}=await query.limit(5);
  if(error)return {matches:[],matchStatus:"UNAVAILABLE"};
  const matches:ExistingCandidateMatch[]=(data??[]).filter((row)=>typeof row.id==="string")
    .map((row)=>({id:String(row.id),label:value.slice(0,180),matchType:"EXACT"}));
  if(candidate.kind==="THREAT_ACTOR"&&matches.length<5){
    const found=await owned.supabase.from("threat_actors").select("id,name")
      .eq("project_id",owned.projectId).contains("aliases",[candidate.name]).limit(5);
    if(found.error)return {matches,matchStatus:"UNAVAILABLE"};
    for(const row of found.data??[]){
      if(typeof row.id!=="string"||matches.some((item)=>item.id===row.id))continue;
      matches.push({id:row.id,label:`${String(row.name)} (alias: ${candidate.name})`.slice(0,180),matchType:"EXACT"});
      if(matches.length===5)break;
    }
  }
  return {matches,matchStatus:"CHECKED"};
}
export async function attachStage3CandidateMatches(owned:OwnedContext,candidates:Stage3Candidate[]){
  const output:Stage3Candidate[]=[];
  for(const candidate of candidates.slice(0,24)){
    const result=await findExistingCandidateMatches(owned,candidate);
    output.push({...candidate,existingMatches:result.matches,matchStatus:result.matchStatus});
  }
  return output;
}
