import Link from "next/link";
import { notFound,redirect } from "next/navigation";
import { z } from "zod";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { FusionInventory } from "@/components/fusion/fusion-inventory";
import { FusionWorldMap } from "@/components/fusion/fusion-world-map";
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
export default async function FusionPage({params,searchParams}:{
 params:Promise<{id:string}>;
 searchParams?:Promise<Search>;
}){
 const {id}=await params;
 const sp=(await searchParams)??{};
 const view=["inventory","graph","map","countries"].includes(first(sp,"view",15))?first(sp,"view",15):"inventory";
 const ctx=await requireOwnedProject(id).catch(()=>notFound());
 if(view==="countries"){
  const country=await selectedCountry(ctx,sp);
  const to=new URLSearchParams();
  for(const [key,value] of Object.entries(sp)) if(key!=="view"&&typeof value==="string")to.set(key,value);
  to.set("view","map");if(country)to.set("country",country);else {to.delete("country");to.delete("countryId");}
  redirect(`/projects/${id}/fusion?${to.toString()}`);
 }
 const project=await ctx.supabase.from("projects").select("name").eq("id",id).single();
 if(project.error||!project.data)notFound();
 const item=(name:string,key:string)=><Link key={key} href={`/projects/${id}/fusion?view=${key}`}
  aria-current={view===key?"page":undefined}
  className={`rounded px-3 py-2 text-sm ${view===key?"bg-[#b9822f]/20 text-amber-300":"text-stone-400 hover:bg-stone-800 hover:text-stone-100"}`}>{name}</Link>;
 type ViewData =
  | {kind:"inventory"; data:Awaited<ReturnType<typeof loadFusionInventory>>; filters:ReturnType<typeof parseInventoryFilters>}
  | {kind:"graph"}
  | {kind:"map"; selected:string; counts:Awaited<ReturnType<typeof countryCounts>>}
  | {kind:"error"};
 let viewData:ViewData={kind:"error"};
 try{
  if(view==="graph"){
   viewData={kind:"graph"};
  }else if(view==="map"){
   viewData={kind:"map",selected:await selectedCountry(ctx,sp),counts:await countryCounts(ctx)};
  }else{
   const filters=parseInventoryFilters(sp);
   viewData={kind:"inventory",filters,data:await loadFusionInventory(id,filters)};
  }
 }catch{viewData={kind:"error"};}
 return <main className={view==="map"?"fusion-map-bleed space-y-2 pb-2":"mx-auto max-w-[1600px] space-y-4 px-2 pb-8"}>
   <div className={view==="map"?"flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-6":"flex flex-wrap items-center justify-between gap-2"}>
    <Link href={`/projects/${id}`} className="text-xs text-stone-500 hover:text-amber-300">← {project.data.name}</Link>
    <p className="text-xs text-stone-600">Fusion Workspace · Analyst-controlled</p>
   </div>
   <nav aria-label="Fusion Workspace views" className={view==="map"?
      "flex flex-wrap gap-1 border-b border-[#48605a]/35 bg-[#0d1417]/65 px-4 py-2 sm:px-6":
      "flex flex-wrap gap-1 rounded border border-stone-800 bg-[#111518] p-1.5"}>
    {item("Evidence Inventory","inventory")}
    {item("Relationship Graph","graph")}
    {item("World Map","map")}
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
   {viewData.kind==="map"&&<FusionWorldMap projectId={id} selectedCountry={viewData.selected} counts={viewData.counts}
     preset={VALID_TYPES.includes(first(sp,"linkType",40))&&z.string().uuid().safeParse(first(sp,"linkId",40)).success?
      {type:first(sp,"linkType",40),id:first(sp,"linkId",40)}:null}/>}
  </main>;
}
