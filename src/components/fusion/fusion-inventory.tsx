"use client";
import Link from "next/link";
import { useState } from "react";
import { FusionInventoryPopup } from "./fusion-inventory-popup";
import type { FusionInventoryFilters,FusionInventoryItem,FusionGroupKind } from "@/lib/fusion/types";
import { groupInventory } from "@/lib/fusion/types";
import countries from "@/lib/fusion/countries.json";

type Labels={source:Record<string,string>;gap:Record<string,string>;requirement:Record<string,string>;country:Record<string,string>};
const TYPES=["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM",
 "INDICATOR","CVE","MITRE","MALWARE","ACTOR","CAMPAIGN","TIMELINE_EVENT","RESEARCH_NOTE",
 "EVIDENCE","COUNTRY_NOTE","INFORMATION_GAP","COLLECTION_REQUIREMENT"];
const GROUPS:[FusionGroupKind,string][]=[
 ["source","By source"],["all","All records"],["gap","Information gap"],["requirement","Collection requirement"],
 ["type","Record type"],["country","Country"]
];
const Badge=({children}:{children:React.ReactNode})=><span className="rounded border border-stone-700/70 bg-[#181e22] px-2 py-0.5 text-[11px] text-stone-300">{children}</span>;
const fmt=(x:string)=>{const d=new Date(x);return Number.isNaN(d.getTime())?"—":d.toLocaleDateString();};
export function FusionInventory({projectId,items,count,labels,filters}:{
 projectId:string;items:FusionInventoryItem[];count:number;labels:Labels;filters:FusionInventoryFilters
}){
 const [selected,setSelected]=useState<FusionInventoryItem|null>(null);
 const groups=groupInventory(items,filters.group,labels);
 const totalPages=Math.max(1,Math.ceil(count/50));
 const pageUrl=(page:number)=>{
  const p=new URLSearchParams();
  p.set("view","inventory");
  for(const [k,v] of Object.entries(filters))if(k!=="page"&&v) p.set(k,String(v));
  p.set("page",String(page));
  return `/projects/${projectId}/fusion?${p.toString()}`;
 };
 return <div className="space-y-4">
  <header className="flex flex-wrap items-end justify-between gap-4">
   <div><p className="citem-label">Investigation / Fusion</p>
    <h1 className="mt-1 text-2xl font-semibold text-[#e8e1d6]">Evidence Inventory</h1>
    <p className="mt-1 text-xs text-stone-500">Canonical investigation records · Source reporting is not an analyst assessment</p></div>
   <div className="text-right text-xs text-stone-400"><strong className="text-lg text-amber-300">{count.toLocaleString()}</strong><span className="block">unique matching records</span></div>
  </header>
  <form className="rounded border border-stone-800 bg-[#111518] p-3" action={`/projects/${projectId}/fusion`} method="get">
    <input type="hidden" name="view" value="inventory"/>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-stone-400">Search
       <input name="q" maxLength={120} placeholder="Title, excerpt, indicator, CVE..." defaultValue={filters.q}
        className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100"/></label>
      <label className="text-xs text-stone-400">Group by
       <select name="group" defaultValue={filters.group} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100">
        {GROUPS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
       </select></label>
      <label className="text-xs text-stone-400">Record type
       <select name="type" defaultValue={filters.type} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100">
        <option value="">All types</option>{TYPES.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}
       </select></label>
      <label className="text-xs text-stone-400">Processing
       <select name="state" defaultValue={filters.state} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100">
        <option value="">Any state</option>{["UNPROCESSED","PROCESSED","IGNORED"].map(v=><option key={v}>{v}</option>)}
       </select></label>
      <label className="text-xs text-stone-400">Source UUID (optional)
       <input name="source" defaultValue={filters.source} placeholder="Source identifier" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100"/></label>
      <label className="text-xs text-stone-400">Gap UUID (optional)
       <input name="gap" defaultValue={filters.gap} placeholder="Gap identifier" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100"/></label>
      <label className="text-xs text-stone-400">Requirement UUID (optional)
       <input name="requirement" defaultValue={filters.requirement} placeholder="Collection requirement" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100"/></label>
      <label className="text-xs text-stone-400">Country
       <select name="country" defaultValue={filters.country} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100">
        <option value="">All countries</option>{countries.map(c=><option key={c.iso2} value={c.iso2}>{c.name}</option>)}
       </select></label>
      <label className="text-xs text-stone-400">Sort
       <select name="sort" defaultValue={filters.sort} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] px-2 py-2 text-stone-100">
         <option value="updated_at">Last updated</option><option value="created_at">Created</option><option value="title">Title</option>
       </select></label>
    </div>
    <div className="mt-3 flex gap-2"><button type="submit" className="citem-button">Apply filters</button>
      <Link href={`/projects/${projectId}/fusion?view=inventory`} className="citem-button-ghost">Reset</Link></div>
  </form>
  <div className="overflow-hidden rounded border border-stone-800 bg-[#111518]">
   {items.length===0?<p className="p-6 text-sm text-stone-500">No matching investigation records. Clear filters or create source material first.</p>:
     groups.map(group=><section key={group.key} className="border-b border-stone-800 last:border-b-0">
       {filters.group!=="all"&&<div className="flex items-center gap-2 bg-[#181e22] px-4 py-2">
         <h2 className="max-w-[75%] truncate text-sm font-medium text-amber-200" title={group.label}>{group.label}</h2>
         <Badge>{group.items.length} memberships on this page</Badge>
       </div>}
       <div className="divide-y divide-stone-800/60">{group.items.map(item=><button key={item.record_type+item.record_id}
         type="button" onClick={()=>setSelected(item)}
         className="grid w-full grid-cols-[110px_minmax(0,1fr)_90px] items-center gap-3 px-4 py-3 text-left hover:bg-[#181e22] focus-visible:outline-2 focus-visible:outline-amber-400 sm:grid-cols-[130px_minmax(0,1fr)_150px_90px]">
        <span className="text-[11px] font-medium text-amber-300">{item.record_type.replaceAll("_"," ")}</span>
        <span className="min-w-0"><span className="block truncate text-sm text-stone-200">{item.title}</span>
         <span className="block truncate text-xs text-stone-500">{item.summary||item.preview_text||item.origin_kind}</span></span>
        <span className="hidden truncate text-xs text-stone-400 sm:block">{item.source_ids.length?
          (labels.source[item.source_ids[0]]||"Source")+(item.source_ids.length>1?` +${item.source_ids.length-1}`:""):
          "Independent"}</span>
        <span className="text-right text-[11px] text-stone-500">{fmt(item.updated_at)}</span>
       </button>)}</div>
     </section>)}
  </div>
  <div className="flex items-center justify-between text-xs text-stone-400">
   <span>Page {filters.page} of {totalPages} · 50 records per page · unique canonical total {count}</span>
   <div className="flex gap-2">{filters.page>1&&<Link className="citem-button-ghost" href={pageUrl(filters.page-1)}>Previous</Link>}
    {filters.page<totalPages&&<Link className="citem-button-ghost" href={pageUrl(filters.page+1)}>Next</Link>}</div>
  </div>
  {selected&&<FusionInventoryPopup key={selected.record_type+selected.record_id} projectId={projectId} item={selected} close={()=>setSelected(null)}/>}
 </div>;
}
