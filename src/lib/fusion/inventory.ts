import "server-only";
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
  group:fusionGroupKinds.includes(group as FusionInventoryFilters["group"])?group as FusionInventoryFilters["group"]:"source",
  page:Math.max(1,Math.min(20000,Number.isFinite(Number(raw.page))?Math.floor(Number(raw.page)):1)),
  sort:["updated_at","created_at","title"].includes(take(raw.sort,20))?take(raw.sort,20):"updated_at",
 };
}
export async function loadFusionInventory(projectId:string, filters:FusionInventoryFilters) {
 const {supabase}=await requireOwnedProject(projectId);
 const columns="project_id,record_type,record_id,title,summary,preview_text,created_at,updated_at,origin_kind,source_id,source_annotation_id,processing_state,metadata,annotation_ids,source_ids,gap_ids,requirement_ids,country_codes";
 const makeQuery=(manual:boolean)=>{
  let query=supabase.from("fusion_inventory_items").select(
    manual?columns+",assigned_source_ids,assigned_gap_ids,assigned_requirement_ids":columns,
    {count:"exact"}).eq("project_id",projectId);
  if(filters.q)query=query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%,preview_text.ilike.%${filters.q}%`);
  if(filters.type)query=query.eq("record_type",filters.type);
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
 let result=await makeQuery(true);
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
 const [sources,gaps,requirements]=await Promise.all([
  sourceIds.length?supabase.from("sources").select("id,title").eq("project_id",projectId).in("id",sourceIds):Promise.resolve({data:[],error:null}),
  gapIds.length?supabase.from("investigation_information_gaps").select("id,description").eq("project_id",projectId).in("id",gapIds):Promise.resolve({data:[],error:null}),
  reqIds.length?supabase.from("collection_requirements").select("id,requirement").eq("project_id",projectId).in("id",reqIds):Promise.resolve({data:[],error:null}),
 ]);
 if(sources.error||gaps.error||requirements.error) throw new Error("Unable to resolve investigation provenance.");
 const toMap=(rows:Record<string,unknown>[],field:string)=>Object.fromEntries(rows.map(r=>[String(r.id),String(r[field]??"")]));
 const labels={
  source:toMap((sources.data??[]) as Record<string,unknown>[],"title"),
  gap:toMap((gaps.data??[]) as Record<string,unknown>[],"description"),
  requirement:toMap((requirements.data??[]) as Record<string,unknown>[],"requirement"),
  country:Object.fromEntries(countries.map(c=>[c.iso2,c.name])),
 };
 return {items,count:result.count??0,labels,assignmentReady};
}
