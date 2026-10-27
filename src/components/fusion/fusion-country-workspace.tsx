"use client";
import { useState } from "react";
import { EvidenceDownload,EvidenceUpload } from "@/components/workspace-forms";
import { createCountryNote,updateCountryNote,deleteCountryNote,attachExistingEvidence,detachExistingEvidence } from "@/app/projects/[id]/fusion/actions";
import type { loadCountryPopup } from "@/lib/fusion/country-data";

export type CountryPopupData=Awaited<ReturnType<typeof loadCountryPopup>>;
export type CountryAction=(action:(form:FormData)=>Promise<void>,form:FormData)=>Promise<void>;
const field="w-full rounded border border-stone-700 bg-[#101417] px-3 py-2 text-[#e8e1d6]";
const button="rounded border border-[#b9822f]/60 px-3 py-2 text-sm text-amber-200 hover:bg-[#b9822f]/15";
function base(projectId:string,code:string) {const f=new FormData();f.set("projectId",projectId);f.set("country",code);return f;}

export function CountryBrief({projectId,code,data,mutate,dirty}:{
 projectId:string;code:string;data:CountryPopupData;mutate:CountryAction;dirty:(v:boolean)=>void
}){
 const [editing,setEditing]=useState(false);
 const brief=data.brief;
 const [value,setValue]=useState<string|null>(null);
 return <section className="rounded border border-stone-700/60 bg-[#14191d] p-4">
  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#e8e1d6]">Country Brief</h3>
   <button className="text-xs text-amber-300 underline" onClick={()=>{setValue(brief?.body??"");setEditing(!editing);dirty(!editing);}}>{editing?"Cancel":"Edit brief"}</button></div>
  {editing?<form className="mt-3 space-y-2" onSubmit={async e=>{
    e.preventDefault();const form=base(projectId,code);form.set("title","Country Brief");form.set("body",value??"");
    if(brief)form.set("noteId",brief.id);
    await mutate(brief?updateCountryNote:createCountryNote,form);setEditing(false);setValue(null);dirty(false);
   }}><textarea aria-label="Country brief" maxLength={50000} rows={5} value={value??""} onChange={e=>{setValue(e.target.value);dirty(true);}} className={field}/>
    <button className={button}>Save brief</button></form>:<p className="mt-2 whitespace-pre-wrap text-sm text-stone-300">{brief?.body||"No analyst-authored brief yet."}</p>}
  {brief&&<p className="mt-2 text-xs text-stone-500">Author {brief.created_by.slice(0,8)} · Updated {new Date(brief.updated_at).toLocaleString()} · Analyst-authored, not independently verified</p>}
 </section>;
}
export function CountryNotesFiles({projectId,code,data,mutate,dirty,page,onPage,filesPage,onFilesPage}:{
 projectId:string;code:string;data:CountryPopupData;mutate:CountryAction;dirty:(v:boolean)=>void;page:number;onPage:(n:number)=>void;filesPage:number;onFilesPage:(n:number)=>void
}){
 const [editing,setEditing]=useState<string|null>(null);
 const [showNew,setShowNew]=useState(false);
 const [attaching,setAttaching]=useState(false);
 const notes=data.notes.filter(n=>n.id!==data.brief?.id);
 const run=async (fn:(f:FormData)=>Promise<void>,form:FormData)=>{
  await mutate(fn,form);setEditing(null);setShowNew(false);dirty(false);
 };
 const ev=Object.fromEntries(data.evidence.map(e=>[e.id,e]));
 return <div className="grid min-w-0 gap-5 lg:grid-cols-2">
  <section className="min-w-0 space-y-3">
   <div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold text-[#e8e1d6]">Country Notes</h3><p className="text-xs text-stone-500">{data.notesTotal} saved notes</p></div>
    <button className={button} onClick={()=>setShowNew(!showNew)}>+ New note</button></div>
   {showNew&&<form className="space-y-2 rounded border border-stone-700 bg-[#14191d] p-3" onSubmit={async e=>{
    e.preventDefault();const f=base(projectId,code);const t=e.currentTarget;f.set("title",(t.elements.namedItem("title") as HTMLInputElement).value);f.set("body",(t.elements.namedItem("body") as HTMLTextAreaElement).value);await run(createCountryNote,f);
   }}><input name="title" aria-label="Note title" placeholder="Note title" required maxLength={180} className={field} onChange={()=>dirty(true)}/>
    <textarea name="body" aria-label="Note content" rows={4} maxLength={50000} className={field} onChange={()=>dirty(true)}/>
    <div className="flex gap-2"><button className={button}>Save note</button><button type="button" className="text-xs text-stone-400" onClick={()=>{setShowNew(false);dirty(false);}}>Cancel</button></div></form>}
   {notes.length===0&&!showNew&&<p className="text-sm text-stone-500">No country notes on this page.</p>}
   {notes.map(n=><article key={n.id} className="rounded border border-stone-800 bg-[#14191d] p-3">
    <div className="flex justify-between gap-2"><div className="min-w-0"><h4 className="break-words text-sm text-stone-200">{n.title}</h4>
     <p className="text-xs text-stone-500">Created {new Date(n.created_at).toLocaleDateString()} · Updated {new Date(n.updated_at).toLocaleDateString()} · Author {n.created_by.slice(0,8)}</p></div>
     <button className="text-xs text-amber-300" onClick={()=>{setEditing(editing===n.id?null:n.id);dirty(false);}}>Edit</button></div>
    {editing===n.id?<form key={n.id} className="mt-3 space-y-2" onSubmit={async e=>{e.preventDefault();const f=base(projectId,code);f.set("noteId",n.id);f.set("title",(e.currentTarget.elements.namedItem("title") as HTMLInputElement).value);f.set("body",(e.currentTarget.elements.namedItem("body") as HTMLTextAreaElement).value);await run(updateCountryNote,f);}}>
     <input className={field} name="title" maxLength={180} required defaultValue={n.title} onChange={()=>dirty(true)}/>
     <textarea className={field} name="body" rows={5} maxLength={50000} defaultValue={n.body} onChange={()=>dirty(true)}/>
     <div className="flex items-center gap-3"><button className={button}>Save changes</button><button type="button" className="text-xs text-stone-400" onClick={()=>{setEditing(null);dirty(false);}}>Cancel</button></div></form>:
     <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-stone-400">{n.body||"Empty note"}</p>}
    <button className="mt-3 text-xs text-red-300" onClick={async ()=>{if(!window.confirm("Delete this note? Files remain stored in Evidence."))return;const f=base(projectId,code);f.set("noteId",n.id);await run(deleteCountryNote,f);}}>Delete note</button>
   </article>)}
   <div className="flex justify-between text-xs text-stone-400"><button disabled={page<=1} onClick={()=>onPage(Math.max(1,page-1))}>Previous</button><span>Page {page}</span><button disabled={page*data.limit>=data.notesTotal} onClick={()=>onPage(page+1)}>Next</button></div>
  </section>
  <section className="min-w-0 space-y-3">
   <div className="flex items-center justify-between"><div><h3 className="font-semibold text-[#e8e1d6]">Files & Images</h3><p className="text-xs text-stone-500">{data.counts.attachments} attached files, stored in private Evidence</p></div>
    <button onClick={()=>setAttaching(!attaching)} className={button}>+ Add file</button></div>
   {attaching&&<div className="space-y-3 rounded border border-stone-700 bg-[#14191d] p-3">
    <details open><summary className="cursor-pointer text-sm text-amber-300">Upload & Attach to Country</summary>
     <div className="mt-3"><EvidenceUpload projectId={projectId} onUploaded={async id=>{
      const f=base(projectId,code);f.set("evidenceId",id);f.set("description","");
      await mutate(attachExistingEvidence,f);
     }}/></div>
    </details>
    <details><summary className="cursor-pointer text-sm text-amber-300">Link Existing Evidence</summary>
     <form className="mt-3 space-y-2" onSubmit={async e=>{e.preventDefault();const f=base(projectId,code);for(const [k,v] of new FormData(e.currentTarget))f.set(k,String(v));await run(attachExistingEvidence,f);}}>
      <EvidencePicker projectId={projectId}/>
      <label className="block text-xs text-stone-400">Attach to note (optional)<select className={field} name="noteId"><option value="">Country</option>{data.notes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
      <input name="description" maxLength={2000} placeholder="Description (optional)" className={field}/>
      <button className={button}>Attach selected Evidence</button></form>
    </details>
   </div>}
   {data.attachments.map(a=>{
    const info=ev[a.evidence_id];
    return <article className="rounded border border-stone-800 bg-[#14191d] p-3 text-sm" key={a.id}>
     <h4 className="break-all text-stone-200">{info?.original_file_name||info?.title||"Evidence record"}</h4>
     <p className="text-xs text-stone-500">{info?.type||"File"}{info?.file_size!=null?` · ${(info.file_size/1024).toFixed(1)} KB`:""} · {a.country_note_id?"Linked to note":"Linked to country"}</p>
     {a.description&&<p className="mt-1 text-xs text-stone-400">{a.description}</p>}
     <div className="mt-2 flex gap-4"><EvidenceDownload projectId={projectId} id={a.evidence_id}/><button className="text-xs text-red-300" onClick={async ()=>{
      if(!window.confirm("Detach file? Original Evidence is preserved."))return;
      const f=base(projectId,code);f.set("attachmentLinkId",a.id);await run(detachExistingEvidence,f);
     }}>Detach</button></div>
    </article>;
   })}
   {data.attachments.length===0&&<p className="text-sm text-stone-500">No attached files on this page.</p>}
   <div className="flex justify-between text-xs text-stone-400"><button disabled={filesPage<=1} onClick={()=>onFilesPage(Math.max(1,filesPage-1))}>Previous files</button><span>File page {data.pages.files}</span><button disabled={data.pages.files*data.limit>=data.filesTotal} onClick={()=>onFilesPage(filesPage+1)}>Next files</button></div>
  </section>
 </div>;
}
function EvidencePicker({projectId}:{projectId:string}){
 const [q,setQ]=useState(""),[items,setItems]=useState<{id:string;title:string;original_file_name:string|null}[]>([]),[page,setPage]=useState(1);
 const [loading,setLoading]=useState(false),[error,setError]=useState("");
 async function load(p:number){
  setLoading(true);setError("");
  try{
   const u=new URL(`/api/projects/${projectId}/fusion/evidence`,window.location.origin);u.searchParams.set("q",q);u.searchParams.set("page",String(p));
   const r=await fetch(u.toString(),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Evidence search failed");
   setItems(j.items);setPage(p);
  }catch(e){setError(e instanceof Error?e.message:"Evidence search failed");}finally{setLoading(false);}
 }
 return <div className="space-y-2"><div className="flex gap-2"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search Evidence" className={field}/><button className={button} type="button" onClick={()=>void load(1)}>Find</button></div>
  {loading&&<p className="text-xs text-stone-400">Searching…</p>}{error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
  <select name="evidenceId" required className={field} aria-label="Existing Evidence"><option value="">Select Evidence</option>{items.map(x=><option key={x.id} value={x.id}>{x.original_file_name||x.title}</option>)}</select>
  <div className="flex justify-between text-xs text-stone-400"><button type="button" disabled={page<=1} onClick={()=>void load(page-1)}>Previous</button><button type="button" onClick={()=>void load(page+1)}>Next</button></div>
 </div>;
}
