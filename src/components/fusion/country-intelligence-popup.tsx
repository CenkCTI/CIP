"use client";
import Link from "next/link";
import { useCallback,useEffect,useRef,useState,useTransition } from "react";
import countries from "@/lib/fusion/countries.json";
import { inventoryDetailUrl,type FusionInventoryItem } from "@/lib/fusion/types";
import type { loadCountryPopup } from "@/lib/fusion/country-data";
import { CountryNotesFiles,CountryBrief } from "./fusion-country-workspace";
import {linkCountryRecord,unlinkCountryRecord,editCountryRelationship} from "@/app/projects/[id]/fusion/actions";
type Data=Awaited<ReturnType<typeof loadCountryPopup>>;
type Tab="overview"|"records"|"notes"|"cyber";
type Country={iso2:string;iso3:string;name:string;region:string|null;subregion:string|null};
const relationTypes=["GENERAL_RELEVANCE","REPORTED_TARGET","REPORTED_LOCATION","REPORTED_ORIGIN","REPORTED_VICTIM_LOCATION","REPORTED_OPERATIONAL_AREA","MENTIONED_IN_SOURCE","OTHER"];
const supported=["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM","ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","TIMELINE_EVENT","RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE"];
const zones:Record<string,string[]>={
 PL:["Europe/Warsaw"],TR:["Europe/Istanbul"],UA:["Europe/Kyiv"],DE:["Europe/Berlin"],FR:["Europe/Paris"],GB:["Europe/London"],IT:["Europe/Rome"],ES:["Europe/Madrid","Atlantic/Canary"],
 US:["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu"],CA:["America/Toronto","America/Winnipeg","America/Edmonton","America/Vancouver"],
 RU:["Europe/Moscow","Asia/Yekaterinburg","Asia/Novosibirsk","Asia/Vladivostok"],CN:["Asia/Shanghai"],
 JP:["Asia/Tokyo"],KR:["Asia/Seoul"],IN:["Asia/Kolkata"],AU:["Australia/Sydney","Australia/Perth","Australia/Adelaide"],BR:["America/Sao_Paulo","America/Manaus"],MX:["America/Mexico_City","America/Tijuana"],AR:["America/Argentina/Buenos_Aires"],
 NL:["Europe/Amsterdam"],BE:["Europe/Brussels"],CH:["Europe/Zurich"],AT:["Europe/Vienna"],SE:["Europe/Stockholm"],NO:["Europe/Oslo"],DK:["Europe/Copenhagen"],FI:["Europe/Helsinki"],
 CZ:["Europe/Prague"],SK:["Europe/Bratislava"],HU:["Europe/Budapest"],RO:["Europe/Bucharest"],BG:["Europe/Sofia"],GR:["Europe/Athens"],
 IL:["Asia/Jerusalem"],SA:["Asia/Riyadh"],AE:["Asia/Dubai"],EG:["Africa/Cairo"],ZA:["Africa/Johannesburg"],NG:["Africa/Lagos"],KE:["Africa/Nairobi"],SG:["Asia/Singapore"],ID:["Asia/Jakarta","Asia/Makassar","Asia/Jayapura"],TH:["Asia/Bangkok"],VN:["Asia/Ho_Chi_Minh"]
};
const capitals:Record<string,string>={PL:"Warsaw",TR:"Ankara",UA:"Kyiv",DE:"Berlin",FR:"Paris",GB:"London",US:"Washington, D.C.",CA:"Ottawa",RU:"Moscow",CN:"Beijing",JP:"Tokyo",IN:"New Delhi",BR:"Brasília",AU:"Canberra",IT:"Rome",ES:"Madrid"};
const field="w-full rounded border border-stone-700 bg-[#101417] px-2.5 py-2 text-sm text-[#e8e1d6]";
const btn="rounded border border-stone-600 px-3 py-1.5 text-sm text-amber-200 hover:border-[#b9822f] hover:bg-[#b9822f]/10 disabled:opacity-40";
function Clock({code}:{code:string}){
 const [now,setNow]=useState<Date|null>(null),[zone,setZone]=useState("");
 const opts=zones[code]??[];
 useEffect(()=>{setZone(opts[0]??"");setNow(new Date());const id=window.setInterval(()=>setNow(new Date()),1000);return ()=>clearInterval(id);},[code]);
 if(!zone||!now)return <span className="text-xs text-stone-500">Local time unavailable · No verified zone mapping</span>;
 let time="Unavailable";try{time=new Intl.DateTimeFormat("en-GB",{timeZone:zone,hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(now);}catch{}
 return <div className="flex flex-wrap items-center gap-2 text-xs text-stone-300">
   <span aria-live="off" className="font-mono text-amber-200">{time}</span>
   <label className="sr-only" htmlFor="country-popup-timezone">Country time zone</label>
   {opts.length>1?<select id="country-popup-timezone" value={zone} onChange={e=>setZone(e.target.value)} className="rounded bg-[#101417] p-1">{opts.map(z=><option key={z}>{z}</option>)}</select>:<span>{zone}</span>}
 </div>;
}
function Pager({page,total,limit,onChange}:{page:number;total:number;limit:number;onChange:(n:number)=>void}){
 return <div className="mt-3 flex items-center justify-between gap-2 text-xs text-stone-400">
  <button className="disabled:opacity-30" disabled={page<=1} onClick={()=>onChange(page-1)}>← Previous</button>
  <span>Page {page} · {total} matching</span><button disabled={page*limit>=total} className="disabled:opacity-30" onClick={()=>onChange(page+1)}>Next →</button>
 </div>;
}
export function CountryIntelligencePopup({projectId,code,onClose,onCountry,preset}:{
 projectId:string;code:string;onClose:()=>void;onCountry:(code:string)=>void;preset?:{type:string;id:string}|null
}){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 const [tab,setTab]=useState<Tab>("overview"),[dirty,setDirty]=useState(false),[maximized,setMaximized]=useState(false);
 const [linksPage,setLinksPage]=useState(1),[notesPage,setNotesPage]=useState(1),[filesPage,setFilesPage]=useState(1);
 const [query,setQuery]=useState(""),[filterType,setFilterType]=useState(""),[relation,setRelation]=useState("");
 const [sort,setSort]=useState("date"),[editingLink,setEditingLink]=useState<string|null>(null),[showLink,setShowLink]=useState(false);
 const [lookup,setLookup]=useState<{record_type:string;record_id:string;title:string}[]>([]);
 const [lookupCount,setLookupCount]=useState(0),[lookupPage,setLookupPage]=useState(1),[lookupQ,setLookupQ]=useState(""),[lookupType,setLookupType]=useState("SOURCE");
 const [chosen,setChosen]=useState(""),[linkRelation,setLinkRelation]=useState("GENERAL_RELEVANCE"),[rationale,setRationale]=useState("");
 const [pending,startTransition]=useTransition();
 const modal=useRef<HTMLDivElement>(null), closeRef=useRef<HTMLButtonElement>(null),previous=useRef<HTMLElement|null>(null);
 const country=(countries as Country[]).find(c=>c.iso2===code);
 const popupUrl=useCallback((mode="detail")=>{
  const p=new URLSearchParams({country:code,linksPage:String(linksPage),notesPage:String(notesPage),filesPage:String(filesPage)});
  if(query)p.set("q",query);if(filterType)p.set("type",filterType);if(relation)p.set("relation",relation);if(sort==="title")p.set("sort","title");
  if(mode==="lookup"){p.set("mode","lookup");p.set("page",String(lookupPage));p.set("q",lookupQ);p.set("type",lookupType);}
  return `/api/projects/${projectId}/fusion/country?${p}`;
 },[projectId,code,linksPage,notesPage,filesPage,query,filterType,relation,sort,lookupPage,lookupQ,lookupType]);
 const load=useCallback(async()=>{
  const r=await fetch(popupUrl(),{cache:"no-store"});const j=await r.json();
  if(!r.ok)throw Error(j.error||"Unable to load country data");
  setData(j as Data);
 },[popupUrl]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError("");setData(null);
  const run=async()=>{try{const r=await fetch(popupUrl(),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Country request failed");if(!cancelled)setData(j);}catch(e){if(!cancelled)setError(e instanceof Error?e.message:"Country request failed");}finally{if(!cancelled)setLoading(false);}};
  void run();return ()=>{cancelled=true;};
 },[popupUrl]);
 const mutate=async(fn:(form:FormData)=>Promise<void>,form:FormData)=>{
  setError("");
  try{await fn(form);await load();window.dispatchEvent(new Event("fusion-country-updated"));}
  catch(e){const msg=e instanceof Error?e.message:"Operation failed";setError(msg);throw e;}
 };
 useEffect(()=>{
  previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  closeRef.current?.focus();
  const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
  const key=(e:KeyboardEvent)=>{
   if(e.key==="Escape"){e.preventDefault();if(!dirty)onClose();else if(window.confirm("Discard unsaved changes?")){setDirty(false);onClose();}}
   if(e.key!=="Tab"||!modal.current)return;
   const elements=[...modal.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length>0);
   if(!elements.length)return;
   const first=elements[0],last=elements[elements.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",key);
  return ()=>{document.removeEventListener("keydown",key);document.body.style.overflow=previousOverflow;previous.current?.focus();};
 // onClose identity is managed by the map; selected country changes retain modal shell.
 },[onClose,dirty]);
 useEffect(()=>{setTab("overview");setDirty(false);setLinksPage(1);setNotesPage(1);setFilesPage(1);setEditingLink(null);setShowLink(Boolean(preset));},[code,preset?.type,preset?.id]);
 const close=()=>{if(dirty&&!window.confirm("Discard unsaved changes?"))return;onClose();};
 const switchCountry=(next:string)=>{if(dirty&&!window.confirm("Discard unsaved changes?"))return;onCountry(next);};
 const apiLookup=async(nextPage=1)=>{
  setError("");try{const q=new URLSearchParams({country:code,mode:"lookup",type:lookupType,q:lookupQ,page:String(nextPage)});
   const r=await fetch(`/api/projects/${projectId}/fusion/country?${q}`,{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Search failed");
   setLookup(j.items);setLookupPage(nextPage);setLookupCount(j.total);
  }catch(e){setError(e instanceof Error?e.message:"Search failed");}
 };
 const formBase=()=>{const f=new FormData();f.set("projectId",projectId);f.set("country",code);return f;};
 const linkSubmit=async (e:React.FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const [type,id]=(chosen|| (preset?`${preset.type}:${preset.id}`:"")).split(":");
  if(!supported.includes(type)||!id){setError("Select an Investigation record");return;}
  const f=formBase();f.set("targetType",type);f.set("targetId",id);f.set("relationType",linkRelation);f.set("rationale",rationale);
  await mutate(linkCountryRecord,f);setShowLink(false);setChosen("");setRationale("");
 };
 const records=data?.links??[];
 const recordDetail=(type:string,id:string)=>data?.details[`${type}:${id}`];
 const itemUrl=(type:string,id:string)=>{
   const item=recordDetail(type,id);
   if(item)return inventoryDetailUrl(projectId,item);
   return `/projects/${projectId}/fusion?view=inventory&country=${code}&type=${type}`;
 };
 const card=(l:Data["links"][number])=>{
  const rec=recordDetail(l.target_type,l.target_id);
  return <article key={l.id} className="rounded border border-stone-800 bg-[#14191d] px-3 py-3 text-sm">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-amber-300">{l.target_type.replaceAll("_"," ")}</p>
     <h4 className="break-words font-medium text-[#e8e1d6]">{rec?.title||l.target_id}</h4>
     <p className="line-clamp-2 text-xs text-stone-400">{rec?.summary||"No additional description"}</p></div>
    <span className="text-xs text-stone-500">{l.relation_type.replaceAll("_"," ")}</span></div>
   {l.rationale&&<p className="mt-2 break-words text-xs text-stone-400">{l.rationale}</p>}
   {rec&&rec.source_ids.length>0&&<p className="mt-1 text-xs text-stone-500">{rec.source_ids.length} source association(s) · reported material is not verified attribution</p>}
   <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
    <Link className="text-amber-300 underline" href={itemUrl(l.target_type,l.target_id)}>Open record</Link>
    <Link className="text-amber-300 underline" href={`/projects/${projectId}/fusion?view=inventory&country=${code}&type=${l.target_type}`}>Inventory</Link>
    <Link className="text-amber-300 underline" href={`/projects/${projectId}/fusion?view=graph`}>Graph</Link>
    <button className="text-stone-300 underline" onClick={()=>setEditingLink(editingLink===l.id?null:l.id)}>Edit</button>
    <button className="text-red-300 underline" onClick={async()=>{
     if(!window.confirm("Remove this country association? The original record will remain intact."))return;
     const f=formBase();f.set("linkId",l.id);await mutate(unlinkCountryRecord,f);
    }}>Unlink</button></div>
   {editingLink===l.id&&<form className="mt-3 space-y-2 border-t border-stone-800 pt-3" onSubmit={async e=>{
    e.preventDefault();const f=formBase();f.set("linkId",l.id);const fields=new FormData(e.currentTarget);f.set("relationType",String(fields.get("relationType")));f.set("rationale",String(fields.get("rationale")??""));await mutate(editCountryRelationship,f);setEditingLink(null);
   }}>
    <label className="block text-xs">Relationship<select name="relationType" className={field} defaultValue={l.relation_type}>{relationTypes.map(r=><option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}</select></label>
    <label className="block text-xs">Rationale<textarea name="rationale" maxLength={4000} defaultValue={l.rationale??""} onChange={()=>setDirty(true)} className={field}/></label>
    <button className={btn}>Save relation</button>
   </form>}
  </article>;
 };
 const cybergroups:[string,string[]][]=[
  ["Reported Incidents",["TIMELINE_EVENT"]],["Reported Threat Actors",["ACTOR","ATTRIBUTION_CLAIM"]],
  ["Campaigns",["CAMPAIGN"]],["Techniques & Vulnerabilities",["MITRE","CVE","INDICATOR","MALWARE"]]];
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-0 sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
   <div role="dialog" aria-modal="true" aria-labelledby="country-popup-heading" ref={modal}
    className={`flex w-full flex-col overflow-hidden border border-stone-700 bg-[#0b0e11] shadow-2xl sm:rounded-lg ${maximized?"h-screen max-w-none sm:h-[96vh]":"h-screen max-w-[1120px] sm:h-[88vh]"}`}>
    <header className="shrink-0 border-b border-stone-800 bg-[#181e22] px-4 py-3 sm:px-6">
     <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">
       <p className="citem-label">Country Intelligence · Investigation-scoped</p>
       <h2 id="country-popup-heading" className="mt-1 text-xl font-semibold text-[#e8e1d6]">{country?.name||code} · {country?.iso2} / {country?.iso3}</h2>
       <p className="text-xs text-stone-400">{country?.region||"Region unavailable"} · {capitals[code]||"Capital not verified"} </p>
       <Clock code={code}/></div>
       <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="country-popup-select">Switch country</label>
        <select id="country-popup-select" aria-label="Switch country" className={field} value={code} onChange={e=>switchCountry(e.target.value)}>
         {countries.map(c=><option key={c.iso2} value={c.iso2}>{c.name}</option>)}
        </select>
        <button className={btn+" hidden sm:block"} onClick={()=>setMaximized(!maximized)}>{maximized?"Restore":"Maximize"}</button>
        <button ref={closeRef} className={btn} aria-label="Close country intelligence popup" onClick={close}>✕</button></div></div>
    </header>
    <nav aria-label="Country intelligence sections" className="flex shrink-0 flex-wrap gap-1 border-b border-stone-800 bg-[#14191d] p-2">
     {([["overview","Overview"],["records","Linked Records"],["notes","Notes & Files"],["cyber","Cyber Activity"]] as [Tab,string][]).map(([key,label])=>
      <button key={key} role="tab" aria-selected={tab===key} className={`rounded px-3 py-2 text-sm ${tab===key?"bg-[#b9822f]/20 text-amber-200":"text-stone-400 hover:bg-stone-800"}`} onClick={()=>setTab(key)}>{label}</button>)}
    </nav>
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
     {error&&<div role="alert" className="mb-3 rounded border border-red-800 bg-[#241c1d] p-3 text-sm text-red-300">{error}
       <button className="ml-2 underline" onClick={()=>{setError("");void load().catch(e=>setError(String(e)));}}>Retry</button></div>}
     {loading&&!data&&<p role="status" className="py-10 text-center text-sm text-stone-400">Loading selected Investigation country…</p>}
     {!loading&&data&&tab==="overview"&&<div className="space-y-5">
       <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[
        ["Linked records",data.counts.links],["Country notes",data.counts.notes],["Attachments",data.counts.attachments],
        ["Linked sources",data.links.filter(l=>l.target_type==="SOURCE").length]
       ].map(([label,value])=><div key={label} className="rounded border border-stone-800 bg-[#14191d] p-3">
        <p className="text-xs text-stone-400">{label}</p><p className="mt-1 text-xl text-amber-200">{value}</p></div>)}</div>
       <CountryBrief key={code} projectId={projectId} code={code} data={data} mutate={mutate} dirty={setDirty}/>
       <section className="space-y-2"><h3 className="text-sm font-semibold text-[#e8e1d6]">Recently linked material</h3>
        {records.length?records.slice(0,5).map(card):<p className="text-sm text-stone-500">No records linked to this country. Link a record to begin.</p>}
        <button className={btn} onClick={()=>setTab("records")}>Manage linked records</button>
       </section>
       <p className="text-xs text-stone-500">Geographic links are analyst annotations. They do not independently establish targeting, origin or attribution.</p>
     </div>}
     {!loading&&data&&tab==="records"&&<section className="space-y-4">
       <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-[#e8e1d6]">Linked Records</h3><p className="text-xs text-stone-500">{data.linksTotal} matching relations. Original records remain canonical.</p></div>
        <button className={btn} onClick={()=>{setShowLink(!showLink);setLookup([]);}}>+ Link Record</button></div>
       {showLink&&<form className="space-y-3 rounded border border-[#b9822f]/40 bg-[#14191d] p-4" onSubmit={e=>void linkSubmit(e).catch(()=>{})}>
        <h4 className="text-sm font-medium text-amber-200">Choose existing Investigation record</h4>
        {preset&&<p className="text-xs text-stone-400">Suggested record: {preset.type} · {preset.id}</p>}
        <div className="grid gap-2 md:grid-cols-3"><label className="text-xs text-stone-400">Type<select className={field} value={lookupType} onChange={e=>{setLookupType(e.target.value);setLookup([]);setChosen("");}}>{supported.map(t=><option key={t}>{t}</option>)}</select></label>
         <label className="text-xs text-stone-400 md:col-span-2">Search records<div className="flex gap-2"><input className={field} value={lookupQ} onChange={e=>setLookupQ(e.target.value)} placeholder="Title, value, CVE..."/><button type="button" className={btn} onClick={()=>void apiLookup(1)}>Search</button></div></label></div>
        <label className="block text-xs text-stone-400">Matching records
         <select value={chosen} onChange={e=>setChosen(e.target.value)} className={field} aria-label="Target Investigation record">
           <option value="">Select a record</option>{lookup.map(r=><option key={r.record_type+":"+r.record_id} value={r.record_type+":"+r.record_id}>{r.title}</option>)}
         </select></label>
        <Pager page={lookupPage} total={lookupCount} limit={20} onChange={n=>void apiLookup(n)}/>
        <label className="block text-xs text-stone-400">Relationship<select value={linkRelation} onChange={e=>setLinkRelation(e.target.value)} className={field}>{relationTypes.map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</select></label>
        <label className="block text-xs text-stone-400">Why is this country relevant?<textarea className={field} maxLength={4000} value={rationale} onChange={e=>{setRationale(e.target.value);setDirty(true);}}/></label>
        <button className={btn} disabled={pending||(!chosen&&!preset)}>Save relationship</button></form>}
       <div className="grid gap-2 md:grid-cols-4">
        <input className={field+" md:col-span-2"} placeholder="Search linked titles" value={query} onChange={e=>{setQuery(e.target.value);setLinksPage(1);}}/>
        <select aria-label="Filter type" className={field} value={filterType} onChange={e=>{setFilterType(e.target.value);setLinksPage(1);}}><option value="">All types</option>{supported.map(t=><option key={t}>{t}</option>)}</select>
        <select aria-label="Filter relationship" className={field} value={relation} onChange={e=>{setRelation(e.target.value);setLinksPage(1);}}><option value="">All relationships</option>{relationTypes.map(t=><option key={t}>{t}</option>)}</select>
       </div>
       <div className="flex items-center gap-2 text-xs text-stone-500">Sort<select className="rounded bg-[#181e22] p-1 text-stone-200" value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Date</option><option value="title">Type / title</option></select></div>
       {records.length?records.map(card):<p className="text-sm text-stone-500">No country relationships match this filter.</p>}
       <Pager page={linksPage} total={data.linksTotal} limit={data.limit} onChange={setLinksPage}/>
      </section>}
     {!loading&&data&&tab==="notes"&&<CountryNotesFiles key={code} projectId={projectId} code={code} data={data} mutate={mutate} dirty={setDirty}
       page={notesPage} onPage={setNotesPage} filesPage={filesPage} onFilesPage={setFilesPage}/>}
     {!loading&&data&&tab==="cyber"&&<section className="space-y-5">
       <p className="text-sm text-stone-400">Only explicitly country-linked Investigation records are shown. No country risk scoring or automatic attribution.</p>
       {cybergroups.map(([title,kinds])=><div key={title} className="space-y-2 rounded border border-stone-800 bg-[#14191d] p-3">
        <h3 className="font-medium text-[#e8e1d6]">{title}</h3>
        {records.filter(l=>kinds.includes(l.target_type)).length?
         records.filter(l=>kinds.includes(l.target_type)).map(card):
         <p className="text-xs text-stone-500">No explicitly linked {title.toLowerCase()} on this page.</p>}
       </div>)}
       <section className="rounded border border-stone-800 p-3"><h3 className="text-sm font-medium text-[#e8e1d6]">Targeted sectors</h3><p className="text-xs text-stone-500">No verified structured sector association is available for this country.</p></section>
       <button className={btn} onClick={()=>{setTab("records");setShowLink(true);}}>Link Cyber Activity Record</button>
      </section>}
     </div>
    <footer className="flex shrink-0 flex-wrap justify-between gap-2 border-t border-stone-800 bg-[#14191d] px-4 py-3 text-xs">
      <p className="text-stone-500">Country association ≠ verified attribution</p>
      <div className="flex gap-4"><Link className="text-amber-300 underline" href={`/projects/${projectId}/fusion?view=inventory&country=${code}`}>View in Inventory</Link>
       <Link className="text-amber-300 underline" href={`/projects/${projectId}/fusion?view=graph`}>View in Graph</Link></div>
    </footer>
   </div>
 </div>;
}
