import "server-only";
import type { AnnotationQuality } from "@/lib/analysis/annotation-credibility/schema";
import { loadAnnotationQuality } from "@/lib/analysis/annotation-credibility/queries";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { fusionGroupKinds, type FusionInventoryFilters, type FusionInventoryItem } from "./types";
import countries from "./countries.json";
const uuid=z.string().uuid();
const safeUuid=(x:string)=>uuid.safeParse(x).success?x:"";
const take=(x:unknown,n=120)=>typeof x==="string"?x.slice(0,n):"";
const searchSafe=(x:unknown)=>take(x).replace(/[(),.*%_\\]/g," ").trim();
export function parseInventoryFilters(raw:Record<string,string|string[]|undefined>):FusionInventoryFilters {
 const group=take(raw.group,20);
 return {
  q:searchSafe(raw.q),
  type:take(raw.type,40).replace(/[^A-Z_]/g,""),
  source:safeUuid(take(raw.source,50)), gap:safeUuid(take(raw.gap,50)),
  requirement:safeUuid(take(raw.requirement,50)),
  country:/^[A-Z]{2}$/.test(take(raw.country,3))?take(raw.country,3):"",
  state:["UNPROCESSED","PROCESSED","IGNORED"].includes(take(raw.state,20))?take(raw.state,20):"",
  credibility:/^(unevaluated|stale|[1-6])$/.test(take(raw.credibility,16))?take(raw.credibility,16):"",
  group:fusionGroupKinds.includes(group as FusionInventoryFilters["group"])?group as FusionInventoryFilters["group"]:"source",
  page:Math.max(1,Math.min(20000,Number.isFinite(Number(raw.page))?Math.floor(Number(raw.page)):1)),
  sort:["updated_at","created_at","title"].includes(take(raw.sort,20))?take(raw.sort,20):"updated_at",
 };
}
export async function loadFusionInventory(projectId:string, filters:FusionInventoryFilters) {
 const context=await requireOwnedProject(projectId);
 const {supabase}=context;
 const columns="project_id,record_type,record_id,title,summary,preview_text,created_at,updated_at,origin_kind,source_id,source_annotation_id,processing_state,metadata,annotation_ids,source_ids,gap_ids,requirement_ids,country_codes";
 const makeQuery=(manual:boolean, credibility?:string)=>{
  const assignmentColumns=manual?",assigned_source_ids,assigned_gap_ids,assigned_requirement_ids":"";
  const reviewColumns=credibility?",annotation_review_id,annotation_credibility,annotation_credibility_stale,annotation_reviewed_at,annotation_subject_status,annotation_source_reliability,annotation_source_reliability_stale":"";
  let query=supabase.from(credibility?"fusion_inventory_annotation_quality_v1":"fusion_inventory_items")
    .select(columns+assignmentColumns+reviewColumns,{count:"exact"}).eq("project_id",projectId);
  if(filters.q)query=query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%,preview_text.ilike.%${filters.q}%`);
  if(credibility) {
    query=query.eq("record_type","ANNOTATION");
    if(credibility==="stale")query=query.eq("annotation_credibility_stale",true);
    else if(credibility==="unevaluated")query=query.eq("annotation_subject_status","ACTIVE").is("annotation_review_id",null);
    else query=query.eq("annotation_credibility",Number(credibility)).eq("annotation_credibility_stale",false);
  } else if(filters.type)query=query.eq("record_type",filters.type);
  if(filters.source)query=manual?query.or(`source_ids.cs.{${filters.source}},assigned_source_ids.cs.{${filters.source}}`):
    query.contains("source_ids",[filters.source]);
  if(filters.gap)query=manual?query.or(`gap_ids.cs.{${filters.gap}},assigned_gap_ids.cs.{${filters.gap}}`):
    query.contains("gap_ids",[filters.gap]);
  if(filters.requirement)query=manual?query.or(`requirement_ids.cs.{${filters.requirement}},assigned_requirement_ids.cs.{${filters.requirement}}`):
    query.contains("requirement_ids",[filters.requirement]);
  if(filters.country)query=query.contains("country_codes",[filters.country]);
  if(filters.state)query=query.eq("processing_state",filters.state);
  return query.order(filters.sort,{ascending:filters.sort==="title"}).order("record_type",{ascending:true})
   .order("record_id",{ascending:true}).range((filters.page-1)*50,filters.page*50-1);
 };
 let credibilityFilterUnavailable=false;
 let result=await makeQuery(true,filters.credibility);
 if(result.error && filters.credibility){
  credibilityFilterUnavailable=true;
  result=await makeQuery(true);
 }
 let assignmentReady=true;
 // Allow the existing read-only Inventory to keep working before SQL 076 is deployed.
 if(result.error && ["42703","PGRST204"].includes(result.error.code)){
  assignmentReady=false;
  result=await makeQuery(false);
 }
 if(result.error)throw Error("Unable to load Fusion Inventory records");
 const rows=(result.data??[]) as unknown as Record<string,unknown>[];
 const items=rows.map(row=>({
   ...row,assigned_source_ids:row.assigned_source_ids??[],
   assigned_gap_ids:row.assigned_gap_ids??[],
   assigned_requirement_ids:row.assigned_requirement_ids??[]
 })) as unknown as FusionInventoryItem[];
 const sourceIds=[...new Set(items.flatMap(i=>[...i.source_ids,...i.assigned_source_ids]))];
 const gapIds=[...new Set(items.flatMap(i=>[...i.gap_ids,...i.assigned_gap_ids]))];
 const reqIds=[...new Set(items.flatMap(i=>[...i.requirement_ids,...i.assigned_requirement_ids]))];
 const annotationIds=items.filter(item=>item.record_type==="ANNOTATION").map(item=>item.record_id);
 const filterApplied=Boolean(filters.credibility && !credibilityFilterUnavailable);
 const filteredQuality=Object.fromEntries(rows.map(row=>[row.record_id,{
   annotation_id:row.record_id,source_id:row.source_id,subject_status:row.annotation_subject_status,
   review_id:row.annotation_review_id,credibility:row.annotation_credibility,stale:row.annotation_credibility_stale,
   reviewed_at:row.annotation_reviewed_at,source_reliability:row.annotation_source_reliability,
   source_reliability_stale:row.annotation_source_reliability_stale,
 }])) as Record<string,AnnotationQuality>;
 const [sources,gaps,requirements,annotationQuality]=await Promise.all([

  sourceIds.length?supabase.from("sources").select("id,title").eq("project_id",projectId).in("id",sourceIds):Promise.resolve({data:[],error:null}),
  gapIds.length?supabase.from("investigation_information_gaps").select("id,description").eq("project_id",projectId).in("id",gapIds):Promise.resolve({data:[],error:null}),
  reqIds.length?supabase.from("collection_requirements").select("id,requirement").eq("project_id",projectId).in("id",reqIds):Promise.resolve({data:[],error:null}),
  filterApplied ? Promise.resolve(filteredQuality) : loadAnnotationQuality(context,annotationIds),
 ]);
 if(sources.error||gaps.error||requirements.error) throw new Error("Unable to resolve investigation provenance.");
 const toMap=(rows:Record<string,unknown>[],field:string)=>Object.fromEntries(rows.map(r=>[String(r.id),String(r[field]??"")]));
 const labels={
  source:toMap((sources.data??[]) as Record<string,unknown>[],"title"),
  gap:toMap((gaps.data??[]) as Record<string,unknown>[],"description"),
  requirement:toMap((requirements.data??[]) as Record<string,unknown>[],"requirement"),
  country:Object.fromEntries(countries.map(c=>[c.iso2,c.name])),
 };
 return {items,count:result.count??0,labels,assignmentReady,annotationQuality,credibilityFilterUnavailable};
}
