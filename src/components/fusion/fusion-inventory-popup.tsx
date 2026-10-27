"use client";
import Link from "next/link";
import { useCallback,useEffect,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import countries from "@/lib/fusion/countries.json";
import { inventoryDetailUrl,type FusionInventoryItem } from "@/lib/fusion/types";
import {
 addFusionInventoryAssignment,updateFusionInventoryAssignment,removeFusionInventoryAssignment,
 linkCountryRecord,editCountryRelationship,unlinkCountryRecord,setSourceReviewStatus
} from "@/app/projects/[id]/fusion/actions";

type AssignmentKind="SOURCE"|"GAP"|"REQUIREMENT";
type Manual={id:string;assignment_kind:AssignmentKind;assigned_id:string;rationale:string|null;created_at:string;updated_at:string};
type CountryLink={id:string;country_iso2:string;relation_type:string;rationale:string|null};
type Payload={item:FusionInventoryItem;manual:Manual[];countries:CountryLink[];labels:Record<string,string>;reviewStatus:string|null};
type Candidate={id:string;label:string};
const choices=["GENERAL_RELEVANCE","REPORTED_TARGET","REPORTED_LOCATION","REPORTED_ORIGIN",
 "REPORTED_VICTIM_LOCATION","REPORTED_OPERATIONAL_AREA","MENTIONED_IN_SOURCE","OTHER"];
const countryCapable=new Set(["SOURCE","SOURCE_ASSET","SOURCE_NOTE","ANNOTATION","SOURCE_CLAIM","ATTRIBUTION_CLAIM",
 "ACTOR","CAMPAIGN","INDICATOR","MALWARE","CVE","MITRE","TIMELINE_EVENT",
 "RESEARCH_NOTE","EVIDENCE","COUNTRY_NOTE","INFORMATION_GAP","COLLECTION_REQUIREMENT"]);
const input="w-full rounded border border-stone-700 bg-[#101417] px-3 py-2 text-sm text-[#e8e1d6]";
const button="rounded border border-[#b9822f]/50 px-3 py-2 text-sm text-amber-200 hover:bg-[#b9822f]/15 disabled:opacity-40";
const fmt=(s:string)=>{const d=new Date(s);return Number.isNaN(d.getTime())?"—":d.toLocaleString();};
function makeForm(projectId:string,item:FusionInventoryItem){
 const form=new FormData();
 form.set("projectId",projectId);form.set("recordType",item.record_type);form.set("recordId",item.record_id);
 form.set("targetType",item.record_type);form.set("targetId",item.record_id);
 return form;
}
function AssignmentEditor({projectId,payload,kind,save,busy}:{
 projectId:string;payload:Payload;kind:AssignmentKind;save:(action:(f:FormData)=>Promise<void>,data:FormData)=>Promise<boolean>;busy:boolean
}){
 const item=payload.item;
 const [query,setQuery]=useState(""),[result,setResult]=useState<Candidate[]>([]);
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const [choice,setChoice]=useState(""),[rationale,setRationale]=useState(""),[editing,setEditing]=useState<string|null>(null);
 const [looking,setLooking]=useState(false),[error,setError]=useState("");
 const canonical=kind==="SOURCE"?item.source_ids:kind==="GAP"?item.gap_ids:item.requirement_ids;
 const assigned=payload.manual.filter(m=>m.assignment_kind===kind);
 const label=kind==="SOURCE"?"Sources":kind==="GAP"?"Information gaps":"Collection requirements";
 const search=async(next:number)=>{
  setLooking(true);setError("");
  try{
   const p=new URLSearchParams({mode:"lookup",kind,q:query,page:String(next)});
   const response=await fetch(`/api/projects/${projectId}/fusion/inventory?${p}`,{cache:"no-store"});
   const json=await response.json();
   if(!response.ok)throw new Error(json.error??"Search failed");
   setResult(json.items);setTotal(json.total);setPage(next);setChoice("");
  }catch(e){setError(e instanceof Error?e.message:"Search failed");}
  finally{setLooking(false);}
 };
 return <section className="space-y-3 rounded border border-stone-800 bg-[#14191d] p-4">
  <div><h3 className="text-sm font-semibold text-amber-200">{label}</h3>
   <p className="text-xs text-stone-500">Original evidence associations are preserved. Manual assignment is organizational only.</p></div>
  <div><p className="mb-1 text-[11px] uppercase tracking-wide text-stone-500">Original provenance · read-only ({canonical.length})</p>
   {canonical.length?<div className="flex flex-wrap gap-1.5">{canonical.map(id=><span key={id} className="rounded bg-[#283139] px-2 py-1 text-xs text-stone-300" title={id}>{payload.labels[id]??id}</span>)}</div>
    :<p className="text-xs text-stone-500">No canonical association recorded</p>}
  </div>
  <div className="space-y-2"><p className="text-[11px] uppercase tracking-wide text-stone-500">Analyst assignments ({assigned.length})</p>
   {assigned.map(a=><div key={a.id} className="rounded border border-stone-700/70 p-2.5 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <div><p className="text-stone-200">{payload.labels[a.assigned_id]??a.assigned_id}</p>
      <p className="text-stone-500">{a.rationale||"No rationale"} · {fmt(a.created_at)}</p></div>
     <div className="flex gap-3">
      <button type="button" disabled={busy} onClick={()=>setEditing(editing===a.id?null:a.id)} className="text-amber-300 underline">Edit</button>
      <button type="button" disabled={busy} className="text-red-300 underline" onClick={async()=>{
       if(!window.confirm("Remove manual assignment? Original records and provenance will be kept."))return;
       const f=makeForm(projectId,item);f.set("assignmentId",a.id);
       await save(removeFusionInventoryAssignment,f);
      }}>Remove</button></div></div>
    {editing===a.id&&<form className="mt-2 flex flex-col gap-2" onSubmit={async e=>{
     e.preventDefault();const f=makeForm(projectId,item);f.set("assignmentId",a.id);
     f.set("rationale",String(new FormData(e.currentTarget).get("rationale")??""));
     await save(updateFusionInventoryAssignment,f);setEditing(null);
    }}><textarea aria-label="Edit assignment rationale" name="rationale" defaultValue={a.rationale??""} maxLength={4000} rows={2} className={input}/>
      <button disabled={busy} className={button}>Save rationale</button></form>}
   </div>)}
   {!assigned.length&&<p className="text-xs text-stone-500">Not manually assigned</p>}</div>
  <form onSubmit={async e=>{
   e.preventDefault();if(!choice)return;
   const f=makeForm(projectId,item);f.set("kind",kind);f.set("assignedId",choice);f.set("rationale",rationale);
   if(await save(addFusionInventoryAssignment,f)){setChoice("");setRationale("");}
  }} className="space-y-2 border-t border-stone-800 pt-3">
   <label className="text-xs text-stone-400">Find an Investigation {label.toLowerCase()} record
    <div className="mt-1 flex gap-2"><input className={input} maxLength={100} placeholder="Search by title" value={query} onChange={e=>setQuery(e.target.value)}/>
     <button type="button" disabled={looking} onClick={()=>void search(1)} className={button}>Search</button></div></label>
   <select aria-label={`Choose ${label}`} className={input} value={choice} onChange={e=>setChoice(e.target.value)}>
    <option value="">Select a record</option>{result.map(r=><option value={r.id} key={r.id}>{r.label}</option>)}
   </select>
   {!!result.length&&<div className="flex justify-between text-xs text-stone-400">
    <button type="button" disabled={page<=1||looking} onClick={()=>void search(page-1)}>Previous</button><span>{total} matches · page {page}</span>
    <button type="button" disabled={page*20>=total||looking} onClick={()=>void search(page+1)}>Next</button></div>}
   <textarea aria-label={`${label} assignment rationale`} maxLength={4000} className={input} rows={2} placeholder="Analyst rationale (optional)" value={rationale} onChange={e=>setRationale(e.target.value)}/>
   {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
   <button disabled={!choice||busy} className={button}>Assign {label.toLowerCase()}</button>
  </form>
 </section>;
}
function CountryEditor({projectId,payload,save,busy}:{
 projectId:string;payload:Payload;save:(action:(f:FormData)=>Promise<void>,data:FormData)=>Promise<boolean>;busy:boolean
}){
 const {item}=payload;
 const [code,setCode]=useState(""),[type,setType]=useState("GENERAL_RELEVANCE"),[rationale,setRationale]=useState("");
 const [editing,setEditing]=useState<string|null>(null);
 return <section className="space-y-3 rounded border border-stone-800 bg-[#14191d] p-4">
  <h3 className="text-sm font-semibold text-amber-200">Country relationships</h3>
  <p className="text-xs text-stone-500">Geographic relevance does not by itself prove attacker origin, targeting or attribution.</p>
  {payload.countries.map(link=><div className="rounded border border-stone-700/70 p-2.5 text-xs" key={link.id}>
   <div className="flex flex-wrap justify-between gap-2">
    <div><p className="text-stone-200">{countries.find(c=>c.iso2===link.country_iso2)?.name??link.country_iso2}</p>
     <p className="text-stone-500">{link.relation_type.replaceAll("_"," ")} · {link.rationale||"No rationale"}</p></div>
    <div className="flex gap-3"><button disabled={busy} onClick={()=>setEditing(editing===link.id?null:link.id)} className="text-amber-300 underline">Edit</button>
     <button disabled={busy} className="text-red-300 underline" onClick={async()=>{
      if(!window.confirm("Remove country association without deleting the record?"))return;
      const f=makeForm(projectId,item);f.set("linkId",link.id);await save(unlinkCountryRecord,f);
     }}>Unlink</button></div></div>
   {editing===link.id&&<form className="mt-2 space-y-2" onSubmit={async e=>{
    e.preventDefault();const fields=new FormData(e.currentTarget);
    const f=makeForm(projectId,item);f.set("linkId",link.id);f.set("country",link.country_iso2);
    f.set("relationType",String(fields.get("relationType")));f.set("rationale",String(fields.get("rationale")??""));
    if(await save(editCountryRelationship,f))setEditing(null);
   }}>
    <select className={input} name="relationType" defaultValue={link.relation_type}>{choices.map(x=><option value={x} key={x}>{x.replaceAll("_"," ")}</option>)}</select>
    <textarea className={input} name="rationale" maxLength={4000} rows={2} defaultValue={link.rationale??""}/>
    <button disabled={busy} className={button}>Save country relationship</button>
   </form>}
  </div>)}
  {payload.countries.length===0&&<p className="text-xs text-stone-500">Not assigned to a country</p>}
  {countryCapable.has(item.record_type)&&<form className="space-y-2 border-t border-stone-800 pt-3" onSubmit={async e=>{
   e.preventDefault();if(!code)return;
   const f=makeForm(projectId,item);f.set("country",code);f.set("relationType",type);f.set("rationale",rationale);
   if(await save(linkCountryRecord,f)){setCode("");setRationale("");}
  }}>
   <label className="block text-xs text-stone-400">Country
    <select className={input} value={code} onChange={e=>setCode(e.target.value)}>
     <option value="">Choose country or territory</option>{countries.map(c=><option value={c.iso2} key={c.iso2}>{c.name}</option>)}
    </select></label>
   <label className="block text-xs text-stone-400">Relationship
    <select className={input} value={type} onChange={e=>setType(e.target.value)}>{choices.map(x=><option value={x} key={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
   <textarea className={input} value={rationale} onChange={e=>setRationale(e.target.value)} maxLength={4000} placeholder="Evidence for this geographic relationship (optional)" rows={2}/>
   <button disabled={!code||busy} className={button}>Link to country</button>
  </form>}
 </section>;
}
export function FusionInventoryPopup({projectId,item,close,assignmentReady=true}:{
 projectId:string;item:FusionInventoryItem;close:()=>void;assignmentReady?:boolean
}){
 const router=useRouter();
 const [payload,setPayload]=useState<Payload|null>(null),[loading,setLoading]=useState(assignmentReady);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[tab,setTab]=useState<"assign"|"evidence">("assign");
 const [review,setReview]=useState("");
 const dialog=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null),closeButton=useRef<HTMLButtonElement>(null);
 const load=useCallback(async()=>{
  const q=new URLSearchParams({type:item.record_type,record:item.record_id});
  const res=await fetch(`/api/projects/${projectId}/fusion/inventory?${q}`,{cache:"no-store"});
  const data=await res.json();
  if(!res.ok)throw Error(data.error??"Unable to load record");
  setPayload(data);setReview(String(data.reviewStatus??""));return data as Payload;
 },[item.record_type,item.record_id,projectId]);
 useEffect(()=>{
  if(!assignmentReady)return;
  let active=true;const run=async()=>{
   try{
    const q=new URLSearchParams({type:item.record_type,record:item.record_id});
    const res=await fetch(`/api/projects/${projectId}/fusion/inventory?${q}`,{cache:"no-store"});
    const data=await res.json();if(!res.ok)throw Error(data.error??"Unable to load record");
    if(active){setPayload(data);setReview(String(data.reviewStatus??""));}
   }catch(e){if(active)setError(e instanceof Error?e.message:"Unable to load record");}
   finally{if(active)setLoading(false);}
  };void run();return ()=>{active=false;};
 },[projectId,item.record_type,item.record_id,assignmentReady]);
 useEffect(()=>{
  returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  closeButton.current?.focus();
  const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
  return ()=>{document.body.style.overflow=overflow;returnFocus.current?.focus();};
 },[]);
 useEffect(()=>{
  const listener=(e:KeyboardEvent)=>{
   if(e.key==="Escape"){e.preventDefault();if(!busy)close();}
   if(e.key!=="Tab"||!dialog.current)return;
   const elements=[...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(el=>el.getClientRects().length>0);
   if(!elements.length)return;
   if(e.shiftKey&&document.activeElement===elements[0]){e.preventDefault();elements[elements.length-1].focus();}
   else if(!e.shiftKey&&document.activeElement===elements[elements.length-1]){e.preventDefault();elements[0].focus();}
  };
  document.addEventListener("keydown",listener);return ()=>document.removeEventListener("keydown",listener);
 },[close,busy]);
 const save=async(fn:(f:FormData)=>Promise<void>,data:FormData)=>{
  setBusy(true);setError("");
  try{await fn(data);await load();router.refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:"Assignment failed");return false;}
  finally{setBusy(false);}
 };
 const selected=payload?.item??item;
 return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-0 sm:p-4"
   onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)close();}}>
  <div role="dialog" aria-modal="true" aria-labelledby="inventory-popup-heading" ref={dialog}
   className="flex h-screen w-full max-w-[1150px] flex-col overflow-hidden border border-stone-700 bg-[#0b0e11] shadow-2xl sm:h-[90vh] sm:rounded-lg">
   <header className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-800 bg-[#181e22] p-4 sm:px-6">
    <div className="min-w-0"><p className="citem-label">Fusion / Evidence Inventory · {selected.record_type.replaceAll("_"," ")}</p>
     <h2 id="inventory-popup-heading" className="mt-1 break-words text-xl font-semibold text-[#e8e1d6]">{selected.title}</h2>
     <p className="mt-1 text-xs text-stone-400">Organize this record here. Source-derived provenance is never overwritten.</p></div>
    <button type="button" ref={closeButton} className={button} disabled={busy} aria-label="Close inventory popup" onClick={close}>✕</button>
   </header>
   <nav className="flex shrink-0 gap-1 border-b border-stone-800 p-2" aria-label="Inventory popup sections">
    <button className={tab==="assign"?"rounded bg-amber-800/20 p-2 text-amber-300":"rounded p-2 text-stone-400"} onClick={()=>setTab("assign")}>Assignments</button>
    <button className={tab==="evidence"?"rounded bg-amber-800/20 p-2 text-amber-300":"rounded p-2 text-stone-400"} onClick={()=>setTab("evidence")}>Evidence & provenance</button>
   </nav>
   <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
    {error&&<div role="alert" className="mb-4 rounded border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}
     <button className="ml-3 underline" type="button" onClick={()=>{setError("");void load().catch(e=>setError(String(e)));}}>Retry</button></div>}
    {!assignmentReady&&<p role="alert" className="rounded border border-amber-900 p-4 text-sm text-amber-200">Read-only mode: migration 076 has not been applied to the connected Supabase database. Install it before using manual assignments.</p>}
    {loading&&<p role="status" className="text-sm text-stone-400">Loading Investigation record and assignments…</p>}
    {!loading&&payload&&tab==="assign"&&<div className="grid gap-4 lg:grid-cols-2">
     <AssignmentEditor key={`${item.record_type}:${item.record_id}:SOURCE`} projectId={projectId} payload={payload} kind="SOURCE" save={save} busy={busy}/>
     <AssignmentEditor key={`${item.record_type}:${item.record_id}:GAP`} projectId={projectId} payload={payload} kind="GAP" save={save} busy={busy}/>
     <AssignmentEditor key={`${item.record_type}:${item.record_id}:REQUIREMENT`} projectId={projectId} payload={payload} kind="REQUIREMENT" save={save} busy={busy}/>
     <CountryEditor key={`${item.record_type}:${item.record_id}:country`} projectId={projectId} payload={payload} save={save} busy={busy}/>
     {selected.record_type==="SOURCE"&&<form className="space-y-2 rounded border border-stone-800 bg-[#14191d] p-4" onSubmit={async e=>{
      e.preventDefault();const f=makeForm(projectId,selected);f.set("sourceId",selected.record_id);f.set("reviewStatus",review);
      await save(setSourceReviewStatus,f);
     }}><h3 className="text-sm font-semibold text-amber-300">Source review state</h3>
      <select className={input} value={review||"NOT_REVIEWED"} onChange={e=>setReview(e.target.value)}>
       {["NOT_REVIEWED","IN_PROGRESS","NEEDS_REVIEW","REVIEWED"].map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
      </select><button className={button} disabled={busy}>Save review state</button>
     </form>}
    </div>}
    {!loading&&payload&&tab==="evidence"&&<section className="space-y-4 text-sm">
     <div className="rounded border border-stone-800 bg-[#14191d] p-4"><h3 className="mb-2 font-semibold text-[#e8e1d6]">Original content · read-only</h3>
      <p className="whitespace-pre-wrap break-words text-stone-300">{selected.preview_text||selected.summary||"No excerpt saved"}</p></div>
     <div className="rounded border border-stone-800 bg-[#14191d] p-4"><h3 className="mb-2 font-semibold text-[#e8e1d6]">Canonical context</h3>
      <p className="text-xs text-stone-400">Origin: {selected.origin_kind} · Updated: {fmt(selected.updated_at)}</p>
      <p className="mt-2 text-xs text-stone-500">{selected.annotation_ids.length} source passages · {selected.source_ids.length} original sources · {selected.gap_ids.length} canonical gaps · {selected.requirement_ids.length} canonical requirements</p>
      {selected.source_ids.map(id=><Link className="mt-2 block text-xs text-amber-300 underline" href={`/projects/${projectId}/sources/${id}`} key={id}>Original source · {payload.labels[id]??id}</Link>)}
      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded bg-[#101417] p-3 text-xs text-stone-500">{JSON.stringify(selected.metadata,null,2)}</pre>
     </div>
    </section>}
   </div>
   <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-stone-800 bg-[#14191d] px-4 py-3 text-xs">
    <span className="text-stone-500">Manual assignments ≠ verified source evidence</span>
    <div className="flex gap-3"><Link className="text-amber-300 underline" href={inventoryDetailUrl(projectId,selected)}>Original record (optional)</Link>
     <button type="button" disabled={busy} onClick={close} className={button}>Done</button></div>
   </footer>
  </div>
 </div>;
}
