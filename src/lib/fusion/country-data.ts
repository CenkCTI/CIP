import "server-only";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import countries from "./countries.json";
import type { FusionInventoryItem } from "./types";

const iso=z.string().regex(/^[A-Z]{2}$/);
const uuid=z.string().uuid();
const types=["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM","ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","TIMELINE_EVENT","RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE"] as const;
const relationTypes=["GENERAL_RELEVANCE","REPORTED_TARGET","REPORTED_LOCATION","REPORTED_ORIGIN","REPORTED_VICTIM_LOCATION","REPORTED_OPERATIONAL_AREA","MENTIONED_IN_SOURCE","OTHER"] as const;
export type CountryType=typeof types[number];
export const countryRecordTypes:readonly string[]=types;
export const countryRelationTypes:readonly string[]=relationTypes;
const safe=(x:string|null,n=120)=>(x??"").slice(0,n).replace(/[(),.*%_\\]/g," ").trim();
const page=(x:string|null)=>Math.max(1,Math.min(10000,Math.floor(Number(x)||1)));
const limit=20;
function need<T>(value:{data:T|null;error:{message:string}|null},message:string):T{
 if(value.error)throw new Error(message);return value.data as T;
}
export async function loadCountryPopup(projectId:string,params:URLSearchParams) {
 const {supabase}=await requireOwnedProject(projectId);
 const code=iso.parse(params.get("country")??"");
 if(!countries.some(c=>c.iso2===code))throw new Error("Country not in reference catalog");
 const membership=need(await supabase.from("investigation_countries").select("id").eq("project_id",projectId).eq("country_iso2",code).maybeSingle(),"Country lookup failed");
 const countryId=(membership as {id:string}|null)?.id??null;
 const linkPage=page(params.get("linksPage")),notePage=page(params.get("notesPage")),filePage=page(params.get("filesPage"));
 const term=safe(params.get("q")),kind=params.get("type")??"",relation=params.get("relation")??"",sort=params.get("sort")==="title"?"title":"created_at";
 const countryCounts=need(await supabase.from("fusion_country_counts").select("links,notes,attachments")
   .eq("project_id",projectId).eq("country_iso2",code).maybeSingle(),"Country metrics failed");
 const counts=countryCounts??{links:0,notes:0,attachments:0};
 const sourcesResult=countryId?await supabase.from("investigation_country_links")
  .select("id",{count:"exact",head:true}).eq("project_id",projectId)
  .eq("investigation_country_id",countryId).eq("target_type","SOURCE"):null;
 if(sourcesResult?.error)throw new Error("Source association count failed");
 const sourceCount=sourcesResult?.count??0;
 let notes:{id:string;title:string;body:string;created_at:string;updated_at:string;created_by:string}[]=[];
 let links:{id:string;target_type:string;target_id:string;relation_type:string;rationale:string|null;created_at:string}[]=[];
 let attachments:{id:string;evidence_id:string;country_note_id:string|null;description:string|null}[]=[];
 let notesTotal=0,linksTotal=0,filesTotal=0;
 let details:Record<string,FusionInventoryItem>={};
 let evidence:{id:string;title:string;type:string;original_file_name:string|null;file_size:number|null}[]=[];
 if(countryId){
  // Fetch one page per section, never all country data for all 249 countries.
  let l=supabase.from("investigation_country_links").select("id,target_type,target_id,relation_type,rationale,created_at",{count:"exact"})
   .eq("project_id",projectId).eq("investigation_country_id",countryId);
  if(types.includes(kind as CountryType))l=l.eq("target_type",kind);
  if(relationTypes.includes(relation as typeof relationTypes[number]))l=l.eq("relation_type",relation);
  // Query canonical inventory first for full-set server-side title search, not a 100-item client sample.
  if(term){
   const search=await supabase.from("fusion_inventory_items").select("record_id")
    .eq("project_id",projectId).contains("country_codes",[code])
    .ilike("title",`%${term}%`).range(0,499);
   if(search.error)throw new Error("Country record search failed");
   const ids=(search.data??[]).map(x=>x.record_id);
   if(ids.length)l=l.in("target_id",ids);else l=l.eq("target_id","00000000-0000-0000-0000-000000000000");
  }
  const [lr,nr]=await Promise.all([
    l.order(sort==="created_at"?"created_at":"target_type",{ascending:sort==="title"})
     .range((linkPage-1)*limit,linkPage*limit-1),
    supabase.from("investigation_country_notes").select("id,title,body,created_at,updated_at,created_by",{count:"exact"})
      .eq("project_id",projectId).eq("investigation_country_id",countryId)
      .order("updated_at",{ascending:false}).range((notePage-1)*limit,notePage*limit-1)
  ]);
  links=need(lr,"Country associations failed")??[];linksTotal=lr.count??0;
  notes=need(nr,"Country notes failed")??[];notesTotal=nr.count??0;
  const recordIds=[...new Set(links.map(l=>l.target_id))];
  if(recordIds.length){
   const r=await supabase.from("fusion_inventory_items").select("*").eq("project_id",projectId).in("record_id",recordIds);
   const list=need(r,"Canonical record lookup failed")??[];
   details=Object.fromEntries((list as FusionInventoryItem[]).map(x=>[`${x.record_type}:${x.record_id}`,x]));
  }
  // Direct country files + note files for the loaded note page. Server counts remain authoritative.
  const noteIds=notes.map(n=>n.id);
  let a=supabase.from("fusion_attachment_links").select("id,evidence_id,country_note_id,description",{count:"exact"})
   .eq("project_id",projectId).order("created_at",{ascending:false});
  a=noteIds.length?a.or(`investigation_country_id.eq.${countryId},country_note_id.in.(${noteIds.join(",")})`):
     a.eq("investigation_country_id",countryId);
  const ar=await a.range((filePage-1)*limit,filePage*limit-1);
  attachments=need(ar,"Country files failed")??[];filesTotal=ar.count??0;
  if(attachments.length){
   const ev=await supabase.from("evidence").select("id,title,type,original_file_name,file_size")
    .eq("project_id",projectId).in("id",[...new Set(attachments.map(x=>x.evidence_id))]);
   evidence=need(ev,"Evidence metadata failed")??[];
  }
 }
 // Brief uses the canonical country note, never an AI summary or duplicated content.
 const br=countryId?await supabase.from("investigation_country_notes")
   .select("id,title,body,created_at,updated_at,created_by").eq("project_id",projectId)
   .eq("investigation_country_id",countryId).eq("title","Country Brief").order("created_at").limit(1).maybeSingle():null;
 if(br?.error)throw new Error("Country brief failed");
 return {country:code,counts,sourceCount,links,linksTotal,notes,notesTotal,attachments,filesTotal,
  details,evidence,brief:br?.data??null,
  pages:{links:linkPage,notes:notePage,files:filePage},limit};
}

export async function searchCountryTargets(projectId:string,params:URLSearchParams){
 const {supabase}=await requireOwnedProject(projectId);
 const kind=params.get("type")??"SOURCE";
 if(!types.includes(kind as CountryType))throw new Error("Unsupported record type");
 const p=page(params.get("page")),term=safe(params.get("q"));
 let q=supabase.from("fusion_inventory_items").select("record_type,record_id,title,summary,source_ids",{count:"exact"})
  .eq("project_id",projectId).eq("record_type",kind).order("title",{ascending:true}).order("record_id",{ascending:true});
 if(term)q=q.ilike("title",`%${term}%`);
 const result=await q.range((p-1)*limit,p*limit-1);
 if(result.error)throw new Error("Unable to find Investigation records");
 return {items:result.data??[],total:result.count??0,page:p,limit};
}
