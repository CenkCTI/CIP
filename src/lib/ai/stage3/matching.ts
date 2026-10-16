import "server-only";

import type { requireOwnedProject } from "@/lib/projects/ownership";
import { validateObservedIndicator } from "@/lib/cti/indicators";
import type { Stage3Candidate } from "./candidates";

type OwnedContext = Awaited<ReturnType<typeof requireOwnedProject>>;
export type ExistingCandidateMatch = {
  id:string;
  label:string;
  matchType:"EXACT" | "POSSIBLE";
};

/**
 * Project-scoped deterministic lookup only. Never dump candidate-relevant
 * tables to NVIDIA. This is read-only UI context, not an auto-merge decision.
 */
export async function findExistingCandidateMatches(
  owned:OwnedContext,
  candidate:Stage3Candidate,
):Promise<{matches:ExistingCandidateMatch[];matchStatus:"CHECKED"|"UNAVAILABLE"}>{
  type Target = "indicators" | "cves" | "mitre_techniques" | "malware" |
    "threat_actors" | "campaigns" | "source_claims";
  let table:Target | null=null;
  let column="";
  let value="";
  let extra:{column:string;value:string}|null=null;
  let matchType:"EXACT"|"POSSIBLE"="EXACT";
  switch(candidate.kind){
    case "INDICATOR": {
      const parsed=validateObservedIndicator({value:candidate.value,type:candidate.indicatorType});
      if(!parsed.valid) return {matches:[],matchStatus:"CHECKED"};
      table="indicators";column="normalized_value";value=parsed.canonical;
      extra={column:"type",value:candidate.indicatorType};break;
    }
    case "CVE":table="cves";column="cve_id";value=candidate.cveId.toUpperCase();break;
    case "MITRE":table="mitre_techniques";column="technique_id";value=candidate.techniqueId.toUpperCase();break;
    case "MALWARE":table="malware";column="name";value=candidate.name;break;
    case "THREAT_ACTOR":table="threat_actors";column="name";value=candidate.name;break;
    case "CAMPAIGN":table="campaigns";column="name";value=candidate.name;break;
    case "SOURCE_CLAIM":table="source_claims";column="claim_summary";value=candidate.claim;matchType="POSSIBLE";break;
    default:return {matches:[],matchStatus:"CHECKED"};
  }
  // Avoid interpolating any user/model content into PostgREST selectors or
  // SQL-like filters. Only exact values on fixed allowlisted columns.
  let query=owned.supabase.from(table).select("id").eq("project_id",owned.projectId)
    .eq(column,value).limit(5);
  if(extra) query=query.eq(extra.column,extra.value);
  const {data,error}=await query;
  if(error) return {matches:[],matchStatus:"UNAVAILABLE"};
  return {
    matches:(data??[]).filter((row)=>typeof row.id==="string")
      .slice(0,5).map((row)=>({id:String(row.id),label:value.slice(0,180),matchType})),
    matchStatus:"CHECKED",
  };
}

export async function attachStage3CandidateMatches(
  owned:OwnedContext,candidates:Stage3Candidate[],
) {
  // Bound source-side queries; all source data stays server-side. No broad DB reads.
  const out:Stage3Candidate[]=[];
  for(const candidate of candidates.slice(0,24)){
    const result=await findExistingCandidateMatches(owned,candidate);
    out.push({...candidate,existingMatches:result.matches,matchStatus:result.matchStatus});
  }
  return out;
}
