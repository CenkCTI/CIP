import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { FusionInventory } from "@/components/fusion/fusion-inventory";
import { FusionWorldMap } from "@/components/fusion/fusion-world-map";
import { FusionCountryWorkspace } from "@/components/fusion/fusion-country-workspace";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { loadFusionInventory,parseInventoryFilters } from "@/lib/fusion/inventory";
import countries from "@/lib/fusion/countries.json";

type Search=Record<string,string|string[]|undefined>;
const first=(q:Search,key:string,max=120)=>typeof q[key]==="string"?q[key].slice(0,max):"";
const VALID_TYPES=["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM",
"INDICATOR","CVE","MITRE","MALWARE","ACTOR","CAMPAIGN","TIMELINE_EVENT","RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE"];
type Context=Awaited<ReturnType<typeof requireOwnedProject>>;

async function countryCounts(ctx:Context){
 const {data,error}=await ctx.supabase.from("fusion_country_counts")
  .select("country_iso2,links,notes,attachments").eq("project_id",ctx.projectId);
 if(error)throw Error("Country metrics unavailable. Apply Fusion migration 072.");
 return Object.fromEntries((data??[]).map(row=>[row.country_iso2,{
  links:Number(row.links??0),notes:Number(row.notes??0),attachments:Number(row.attachments??0)
 }]));
}
async function selectedCountry(ctx:Context,sp:Search){
 const input=first(sp,"country",3);
 if(countries.some(c=>c.iso2===input))return input;
 const id=first(sp,"countryId",40);
 if(z.string().uuid().safeParse(id).success){
  const found=await ctx.supabase.from("investigation_countries").select("country_iso2")
   .eq("project_id",ctx.projectId).eq("id",id).maybeSingle();
  return found.data?.country_iso2??"";
 }
 return "";
}
async function countryData(ctx:Context,code:string,sp:Search){
 const projectId=ctx.projectId;
 const empty={notes:[],links:[],attachments:[],recordOptions:[],evidenceOptions:[],
  recordCount:0,attachmentCount:0,selectedTarget:null} as {
   notes:{id:string;title:string;body:string;created_at:string;updated_at:string}[];
   links:{id:string;target_type:string;target_id:string;relation_type:string;rationale:string|null}[];
   attachments:{id:string;evidence_id:string;country_note_id:string|null;description:string|null}[];
   recordOptions:{record_type:string;record_id:string;title:string}[];
   evidenceOptions:{id:string;title:string;type:string;original_file_name:string|null;file_size:number|null}[];
   recordCount:number;attachmentCount:number;selectedTarget:{type:string;id:string}|null;
  };
 if(!code)return empty;
 const country=await ctx.supabase.from("investigation_countries").select("id")
  .eq("project_id",projectId).eq("country_iso2",code).maybeSingle();
 if(country.error)throw Error("Unable to read country membership");
 const activeId=country.data?.id??"";
 const safeSearch=first(sp,"recordQ",100).replace(/[(),.*%_\\]/g," ").trim();
 let pickQuery=ctx.supabase.from("fusion_inventory_items").select("record_type,record_id,title")
  .eq("project_id",projectId).in("record_type",VALID_TYPES).order("updated_at",{ascending:false}).limit(100);
 if(safeSearch)pickQuery=pickQuery.ilike("title",`%${safeSearch}%`);
 const [noteResult,linkResult,picker,evidenceResult]=await Promise.all([
  activeId?ctx.supabase.from("investigation_country_notes")
   .select("id,title,body,created_at,updated_at",{count:"exact"}).eq("project_id",projectId)
   .eq("investigation_country_id",activeId).order("updated_at",{ascending:false}).limit(100):
   Promise.resolve({data:[],error:null,count:0}),
  activeId?ctx.supabase.from("investigation_country_links")
   .select("id,target_type,target_id,relation_type,rationale",{count:"exact"}).eq("project_id",projectId)
   .eq("investigation_country_id",activeId).order("created_at",{ascending:false}).limit(100):
   Promise.resolve({data:[],error:null,count:0}),
  pickQuery,
  ctx.supabase.from("evidence").select("id,title,type,original_file_name,file_size")
   .eq("project_id",projectId).order("created_at",{ascending:false}).limit(100),
 ]);
 if(noteResult.error||linkResult.error||picker.error||evidenceResult.error)
  throw Error("Unable to load country workspace.");
 const notes=(noteResult.data??[]) as typeof empty.notes;
 const links=(linkResult.data??[]) as typeof empty.links;
 const noteIds=notes.map(n=>n.id);
 let attachmentQuery=ctx.supabase.from("fusion_attachment_links")
  .select("id,evidence_id,country_note_id,description",{count:"exact"}).eq("project_id",projectId)
  .order("created_at",{ascending:false}).limit(100);
 if(activeId) attachmentQuery=noteIds.length?
  attachmentQuery.or(`investigation_country_id.eq.${activeId},country_note_id.in.(${noteIds.join(",")})`):
  attachmentQuery.eq("investigation_country_id",activeId);
 else return {...empty,recordOptions:(picker.data??[]) as typeof empty.recordOptions,evidenceOptions:(evidenceResult.data??[]) as typeof empty.evidenceOptions};
 const attachmentResult=await attachmentQuery;
 if(attachmentResult.error)throw Error("Unable to load country evidence attachments.");
 const attachments=(attachmentResult.data??[]) as typeof empty.attachments;
 const missingEvidence=attachments.map(a=>a.evidence_id).filter(id=>!(evidenceResult.data??[]).some(e=>e.id===id));
 const extraEvidence=missingEvidence.length?await ctx.supabase.from("evidence")
  .select("id,title,type,original_file_name,file_size").eq("project_id",projectId).in("id",missingEvidence):
  {data:[],error:null};
 const linkedIDs=links.map(l=>l.target_id);
 const existingOptions=(picker.data??[]) as typeof empty.recordOptions;
 const needs=linkedIDs.filter(id=>!existingOptions.some(o=>o.record_id===id));
 const extraRecords=needs.length?await ctx.supabase.from("fusion_inventory_items")
  .select("record_type,record_id,title").eq("project_id",projectId).in("record_id",needs):
  {data:[],error:null};
 const type=first(sp,"linkType",40),id=first(sp,"linkId",40);
 const selectedTarget=VALID_TYPES.includes(type)&&z.string().uuid().safeParse(id).success?{type,id}:null;
 return {
  notes,links,attachments,recordCount:linkResult.count??links.length,
  attachmentCount:attachmentResult.count??attachments.length,
  recordOptions:[...existingOptions,...((extraRecords.data??[]) as typeof empty.recordOptions)],
  evidenceOptions:[...((evidenceResult.data??[]) as typeof empty.evidenceOptions),
    ...((extraEvidence.data??[]) as typeof empty.evidenceOptions)],
  selectedTarget,
 };
}
export default async function FusionPage({params,searchParams}:{
 params:Promise<{id:string}>;
 searchParams?:Promise<Search>;
}){
 const {id}=await params;
 const sp=(await searchParams)??{};
 const view=["inventory","graph","map","countries"].includes(first(sp,"view",15))?first(sp,"view",15):"inventory";
 const ctx=await requireOwnedProject(id).catch(()=>notFound());
 const project=await ctx.supabase.from("projects").select("name").eq("id",id).single();
 if(project.error||!project.data)notFound();
 const item=(name:string,key:string)=><Link key={key} href={`/projects/${id}/fusion?view=${key}`}
  aria-current={view===key?"page":undefined}
  className={`rounded px-3 py-2 text-sm ${view===key?"bg-[#b9822f]/20 text-amber-300":"text-stone-400 hover:bg-stone-800 hover:text-stone-100"}`}>{name}</Link>;
 type ViewData =
  | {kind:"inventory"; data:Awaited<ReturnType<typeof loadFusionInventory>>; filters:ReturnType<typeof parseInventoryFilters>}
  | {kind:"graph"}
  | {kind:"map"; selected:string; counts:Awaited<ReturnType<typeof countryCounts>>}
  | {kind:"countries"; code:string; data:Awaited<ReturnType<typeof countryData>>}
  | {kind:"error"};
 let viewData:ViewData={kind:"error"};
 try{
  if(view==="graph"){
   viewData={kind:"graph"};
  }else if(view==="map"){
   viewData={kind:"map",selected:await selectedCountry(ctx,sp),counts:await countryCounts(ctx)};
  }else if(view==="countries"){
   const code=await selectedCountry(ctx,sp);
   viewData={kind:"countries",code,data:await countryData(ctx,code,sp)};
  }else{
   const filters=parseInventoryFilters(sp);
   viewData={kind:"inventory",filters,data:await loadFusionInventory(id,filters)};
  }
 }catch{viewData={kind:"error"};}
 return <main className="mx-auto max-w-[1600px] space-y-4 px-2 pb-8">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <Link href={`/projects/${id}`} className="text-xs text-stone-500 hover:text-amber-300">← {project.data.name}</Link>
    <p className="text-xs text-stone-600">Fusion Workspace · Analyst-controlled</p>
   </div>
   <nav aria-label="Fusion Workspace views" className="flex flex-wrap gap-1 rounded border border-stone-800 bg-[#111518] p-1.5">
    {item("Evidence Inventory","inventory")}
    {item("Relationship Graph","graph")}
    {item("World Map","map")}
    {item("Country Notes & Attachments","countries")}
   </nav>
   {viewData.kind==="error"&&<div role="alert" className="rounded border border-red-800/60 bg-[#14191d] p-5 text-sm text-red-300">
    Fusion Workspace could not load. Check that migrations 069–074 have been applied and the investigation data are accessible.
   </div>}
   {viewData.kind==="inventory"&&<FusionInventory projectId={id} filters={viewData.filters} {...viewData.data}/>}
   {viewData.kind==="graph"&&<section>
     <header className="mb-4"><p className="citem-label">Investigation / Fusion</p>
      <h1 className="mt-1 text-2xl font-semibold text-stone-100">Relationship Graph</h1>
      <p className="mt-1 text-xs text-stone-500">Existing CİTEM graph service; source-derived and manual edges remain distinct.</p>
     </header><KnowledgeGraph projectId={id}/></section>}
   {viewData.kind==="map"&&<FusionWorldMap projectId={id} selectedCountry={viewData.selected} counts={viewData.counts}/>}
   {viewData.kind==="countries"&&<FusionCountryWorkspace projectId={id} code={viewData.code} {...viewData.data}/>}
  </main>;
}
