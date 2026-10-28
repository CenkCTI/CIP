import "server-only";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import countries from "./countries.json";
import type { FusionInventoryItem } from "./types";

const iso=z.string().regex(/^[A-Z]{2}$/);
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
 let links:{id:string;target_type:string;target_id:string;relation_type:string;rationale:string|null;created_at:string;title:string;summary:string;source_ids:string[];gap_ids:string[];requirement_ids:string[];metadata:Record<string,unknown>;record_created_at:string}[]=[];
 let attachments:{id:string;evidence_id:string;country_note_id:string|null;description:string|null}[]=[];
 let notesTotal=0,linksTotal=0,filesTotal=0;
 let typeCounts:{target_type:string;total:number}[]=[];let overviewRecords:typeof links=[];
 let details:Record<string,FusionInventoryItem>={};
 let evidence:{id:string;title:string;type:string;original_file_name:string|null;file_size:number|null}[]=[];
 if(countryId){
  // Fetch one page per section, never all country data for all 249 countries.
  // security_invoker view joins the canonical record; title filters and pagination
  // operate across the whole country dataset, not a preloaded 100/500-record sample.
  let l=supabase.from("fusion_country_link_items")
    .select("id,target_type,target_id,relation_type,rationale,created_at,title,summary,source_ids,gap_ids,requirement_ids,metadata,record_created_at",{count:"exact"})
    .eq("project_id",projectId).eq("country_iso2",code);
  if(types.includes(kind as CountryType))l=l.eq("target_type",kind);
  if(relationTypes.includes(relation as typeof relationTypes[number]))l=l.eq("relation_type",relation);
  if(term)l=l.ilike("title",`%${term}%`);
  const [lr,nr,countsByType,preview]=await Promise.all([
    l.order(sort==="title"?"title":"created_at",{ascending:sort==="title"}).order("id",{ascending:true})
     .range((linkPage-1)*limit,linkPage*limit-1),
    supabase.from("investigation_country_notes").select("id,title,body,created_at,updated_at,created_by",{count:"exact"})
      .eq("project_id",projectId).eq("investigation_country_id",countryId)
      .order("updated_at",{ascending:false}).range((notePage-1)*limit,notePage*limit-1),
    supabase.from("fusion_country_link_type_counts").select("target_type,total").eq("project_id",projectId).eq("country_iso2",code),
    supabase.from("fusion_country_link_items")
      .select("id,target_type,target_id,relation_type,rationale,created_at,title,summary,source_ids,gap_ids,requirement_ids,metadata,record_created_at")
      .eq("project_id",projectId).eq("country_iso2",code).order("created_at",{ascending:false}).limit(6)
  ]);
  links=need(lr,"Country associations failed")??[];linksTotal=lr.count??0;
  typeCounts=need(countsByType,"Country relation totals failed")??[];
  overviewRecords=need(preview,"Country preview failed")??[];
  notes=need(nr,"Country notes failed")??[];notesTotal=nr.count??0;
  const recordIds=[...new Set(links.map(l=>l.target_id))];
  if(recordIds.length){
   const r=await supabase.from("fusion_inventory_items").select("*").eq("project_id",projectId).in("record_id",recordIds);
   const list=need(r,"Canonical record lookup failed")??[];
   details=Object.fromEntries((list as FusionInventoryItem[]).map(x=>[`${x.record_type}:${x.record_id}`,x]));
  }
  // Country attachments include all country-note pages, using canonical Evidence RLS.
  const ar=await supabase.from("fusion_country_attachment_items")
   .select("id,evidence_id,country_note_id,description,evidence_title,original_file_name,file_size,evidence_type",{count:"exact"})
   .eq("project_id",projectId).eq("country_iso2",code).order("created_at",{ascending:false})
   .order("id",{ascending:true}).range((filePage-1)*limit,filePage*limit-1);
  const attachmentRows=need(ar,"Country files failed")??[];
  attachments=attachmentRows.map(a=>({id:a.id,evidence_id:a.evidence_id,country_note_id:a.country_note_id,description:a.description}));
  filesTotal=ar.count??0;
  evidence=attachmentRows.map(a=>({id:a.evidence_id,title:a.evidence_title,
    type:a.evidence_type as string,original_file_name:a.original_file_name,file_size:a.file_size}));

 }
 // Brief uses the canonical country note, never an AI summary or duplicated content.
 const br=countryId?await supabase.from("investigation_country_notes")
   .select("id,title,body,created_at,updated_at,created_by").eq("project_id",projectId)
   .eq("investigation_country_id",countryId).eq("title","Country Brief").order("created_at").limit(1).maybeSingle():null;
 if(br?.error)throw new Error("Country brief failed");
 // Explicitly scoped Cyber Activity previews; counts are global to the selected
 // country even when the active Linked Records page is filtered or paginated.
 const groups=[
  {key:"incidents",kinds:["TIMELINE_EVENT"]},
  {key:"actors",kinds:["ACTOR","ATTRIBUTION_CLAIM"]},
  {key:"campaigns",kinds:["CAMPAIGN"]},
  {key:"technical",kinds:["MITRE","CVE","INDICATOR","MALWARE"]}
 ];
 const cyber=await Promise.all(groups.map(async g=>{
  const response=await supabase.from("fusion_country_link_items")
   .select("id,target_type,target_id,relation_type,rationale,created_at,title,summary,source_ids,gap_ids,requirement_ids,metadata",{count:"exact"})
   .eq("project_id",projectId).eq("country_iso2",code)
   .in("target_type",g.kinds).order("created_at",{ascending:false}).range(0,7);
  if(response.error)throw new Error("Cyber Activity query failed");
  return {key:g.key,total:response.count??0,items:response.data??[]};
 }));
 return {country:code,counts,sourceCount,cyber,typeCounts,overviewRecords,links,linksTotal,notes,notesTotal,attachments,filesTotal,
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
