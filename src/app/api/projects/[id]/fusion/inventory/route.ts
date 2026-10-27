import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import type { FusionInventoryItem } from "@/lib/fusion/types";

const recordTypes=z.enum([
 "SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM",
 "ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","TIMELINE_EVENT",
 "RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE","INFORMATION_GAP","COLLECTION_REQUIREMENT"
]);
const uuid=z.string().uuid();
const kinds=z.enum(["SOURCE","GAP","REQUIREMENT"]);
const config={
 SOURCE:{table:"sources",field:"title"},
 GAP:{table:"investigation_information_gaps",field:"description"},
 REQUIREMENT:{table:"collection_requirements",field:"requirement"}
} as const;
const scrub=(input:string)=>input.slice(0,100).replace(/[(),.*%_\\]/g," ").trim();
const pageOf=(input:string|null)=>Math.max(1,Math.min(10000,Math.floor(Number(input)||1)));
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const {id:projectId}=await params;
  const {supabase}=await requireOwnedProject(projectId);
  const q=req.nextUrl.searchParams;
  if(q.get("mode")==="lookup"){
   const kind=kinds.parse(q.get("kind"));
   const {table,field}=config[kind];
   const term=scrub(q.get("q")??"");
   const page=pageOf(q.get("page"));
   let request=supabase.from(table).select(`id,${field}`,{count:"exact"})
    .eq("project_id",projectId).order(field,{ascending:true}).order("id",{ascending:true});
   if(term)request=request.ilike(field,`%${term}%`);
   const result=await request.range((page-1)*20,page*20-1);
   if(result.error)throw Error("Cannot search authorized assignment targets");
   const items=(result.data??[]) as unknown as Record<string,string>[];
   return NextResponse.json({items:items.map(x=>({id:x.id,label:x[field]})),total:result.count??0,page},{
    headers:{"Cache-Control":"private, no-store"}
   });
  }
  const recordType=recordTypes.parse(q.get("type"));
  const recordId=uuid.parse(q.get("record"));
  const [record,manual,links,countries]=await Promise.all([
   supabase.from("fusion_inventory_items").select("*").eq("project_id",projectId)
    .eq("record_type",recordType).eq("record_id",recordId).maybeSingle(),
   supabase.from("fusion_record_assignments")
    .select("id,assignment_kind,assigned_id,rationale,created_at,updated_at")
    .eq("project_id",projectId).eq("record_type",recordType).eq("record_id",recordId)
    .order("created_at",{ascending:true}),
   supabase.from("investigation_country_links").select("id,investigation_country_id,relation_type,rationale")
    .eq("project_id",projectId).eq("target_type",recordType).eq("target_id",recordId),
   supabase.from("investigation_countries").select("id,country_iso2").eq("project_id",projectId)
  ]);
  if(record.error||!record.data) return NextResponse.json({error:"Record not found"},{status:404});
  if(manual.error||links.error||countries.error)throw Error("Unable to load assignments");
  const item=record.data as unknown as FusionInventoryItem;
  const entries=manual.data??[];
  const linkRows=links.data??[];
  const countryIndex=Object.fromEntries((countries.data??[]).map(c=>[c.id,c.country_iso2]));
  const idsByKind=(kind:"SOURCE"|"GAP"|"REQUIREMENT")=>[...new Set([
   ...(entries.filter(a=>a.assignment_kind===kind).map(a=>a.assigned_id)),
   ...(kind==="SOURCE"?item.source_ids:kind==="GAP"?item.gap_ids:item.requirement_ids)
  ])];
  const [sources,gaps,requirements]=await Promise.all([
   idsByKind("SOURCE").length?supabase.from("sources").select("id,title").eq("project_id",projectId)
    .in("id",idsByKind("SOURCE")):Promise.resolve({data:[],error:null}),
   idsByKind("GAP").length?supabase.from("investigation_information_gaps").select("id,description").eq("project_id",projectId)
    .in("id",idsByKind("GAP")):Promise.resolve({data:[],error:null}),
   idsByKind("REQUIREMENT").length?supabase.from("collection_requirements").select("id,requirement").eq("project_id",projectId)
    .in("id",idsByKind("REQUIREMENT")):Promise.resolve({data:[],error:null})
  ]);
  if(sources.error||gaps.error||requirements.error)throw Error("Unable to resolve assignment names");
  const labels:Record<string,string>={};
  for(const row of sources.data??[])labels[row.id]=row.title;
  for(const row of gaps.data??[])labels[row.id]=row.description;
  for(const row of requirements.data??[])labels[row.id]=row.requirement;
  return NextResponse.json({item,manual:entries,
   countries:linkRows.map(l=>({
    id:l.id,country_iso2:countryIndex[l.investigation_country_id]??null,
    relation_type:l.relation_type,rationale:l.rationale
   })).filter(c=>c.country_iso2),labels},{headers:{"Cache-Control":"private, no-store"}});
 }catch{
  return NextResponse.json({error:"Inventory record unavailable or access denied"},
   {status:403,headers:{"Cache-Control":"private, no-store"}});
 }
}
