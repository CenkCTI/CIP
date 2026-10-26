import Link from "next/link";
import countries from "@/lib/fusion/countries.json";
import { EvidenceDownload, EvidenceUpload } from "@/components/workspace-forms";
import { ConfirmSubmit } from "./confirm-submit";
import { createCountryNote,updateCountryNote,deleteCountryNote,linkCountryRecord,unlinkCountryRecord,
 attachExistingEvidence,detachExistingEvidence } from "@/app/projects/[id]/fusion/actions";

type Country={iso2:string;iso3:string;name:string;region:string|null;subregion:string|null};
type Note={id:string;title:string;body:string;created_at:string;updated_at:string};
type LinkRow={id:string;target_type:string;target_id:string;relation_type:string;rationale:string|null};
type Attachment={id:string;evidence_id:string;country_note_id:string|null;description:string|null};
type RecordPick={record_type:string;record_id:string;title:string};
type Evidence={id:string;title:string;type:string;original_file_name:string|null;file_size:number|null};
const relationTypes=[
 "GENERAL_RELEVANCE","REPORTED_TARGET","REPORTED_LOCATION","REPORTED_ORIGIN",
 "REPORTED_VICTIM_LOCATION","REPORTED_OPERATIONAL_AREA","MENTIONED_IN_SOURCE","OTHER"
];
const pretty=(x:string)=>x.replaceAll("_"," ").toLowerCase();
export function FusionCountryWorkspace({projectId,code,notes,links,attachments,recordOptions,
 evidenceOptions,recordCount,attachmentCount,selectedTarget,error}:{
 projectId:string;code:string;notes:Note[];links:LinkRow[];attachments:Attachment[];
 recordOptions:RecordPick[];evidenceOptions:Evidence[];recordCount:number;attachmentCount:number;
 selectedTarget:{type:string;id:string}|null;error?:string
}){
 const country=(countries as Country[]).find(c=>c.iso2===code);
 const evidenceById=Object.fromEntries(evidenceOptions.map(e=>[e.id,e]));
 const recordByKey=Object.fromEntries(recordOptions.map(x=>[x.record_type+":"+x.record_id,x]));
 const chosen=selectedTarget&&recordByKey[selectedTarget.type+":"+selectedTarget.id];
 const h=(formName:string)=><><input type="hidden" name="projectId" value={projectId}/>
  <input type="hidden" name="country" value={code}/></>;
 return <section className="space-y-4">
  <header><p className="citem-label">Investigation / Fusion</p><h1 className="mt-1 text-2xl font-semibold text-stone-100">Country Notes & Attachments</h1>
   <p className="mt-1 text-xs text-stone-500">Explicit analyst associations do not constitute verified geographic attribution.</p></header>
  <form action={`/projects/${projectId}/fusion`} method="get" className="flex flex-wrap items-end gap-2 rounded border border-stone-800 bg-[#14191d] p-3">
    <input type="hidden" name="view" value="countries"/>
    <label className="min-w-60 flex-1 text-xs text-stone-400">Country or territory
     <select name="country" defaultValue={code} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200" required>
      <option value="">Select country</option>{countries.map(c=><option key={c.iso2} value={c.iso2}>{c.name} ({c.iso2})</option>)}
     </select></label><button className="citem-button" type="submit">Open country</button>
    {country&&<Link className="citem-button-ghost" href={`/projects/${projectId}/fusion?view=map&country=${code}`}>View on map</Link>}
   </form>
  {error&&<p role="alert" className="rounded border border-red-800 p-3 text-sm text-red-300">{error}</p>}
  {!country?<div className="rounded border border-stone-800 p-6 text-sm text-stone-500">Choose one of the 249 ISO catalog entries. A country need not have any investigation records to be opened.</div>:<>
   <div className="rounded border border-stone-800 bg-[#14191d] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="citem-label">Country workbench</p>
     <h2 className="mt-1 text-xl font-semibold text-[#e8e1d6]">{country.name} <span className="text-sm text-stone-500">{country.iso2}/{country.iso3}</span></h2>
     <p className="text-xs text-stone-500">{country.region} · {country.subregion}</p></div>
     <Link href={`/projects/${projectId}/fusion?view=inventory&country=${code}`} className="text-xs text-amber-300 underline">Country inventory</Link></div>
   </div>
   <div className="grid gap-4 lg:grid-cols-2">
    <section className="min-w-0 rounded border border-stone-800 bg-[#14191d] p-4">
     <h3 className="text-base font-semibold text-stone-100">Country notes <span className="text-xs font-normal text-stone-500">({notes.length} displayed)</span></h3>
     <p className="mt-1 text-xs text-stone-500">These notes are authored by an analyst, not directly verified source statements.</p>
     <form action={createCountryNote} className="mt-3 space-y-2">
       {h("note")}<label className="block text-xs text-stone-400">Title<input name="title" required maxLength={180} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-100"/></label>
       <label className="block text-xs text-stone-400">Notes<textarea name="body" maxLength={50000} rows={4} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-100"/></label>
       <button className="citem-button" type="submit">Add country note</button>
     </form>
     <div className="mt-4 space-y-2">{notes.map(n=><details key={n.id} className="rounded border border-stone-800 bg-[#111518] p-3">
      <summary className="cursor-pointer text-sm font-medium text-stone-200">{n.title}
       <span className="ml-2 text-xs font-normal text-stone-500">{new Date(n.updated_at).toLocaleDateString()}</span></summary>
      <form action={updateCountryNote} className="mt-3 space-y-2">
       {h("update")}<input type="hidden" name="noteId" value={n.id}/>
       <input name="title" required maxLength={180} defaultValue={n.title} className="w-full rounded border border-stone-700 bg-[#101417] p-2 text-sm text-stone-100"/>
       <textarea name="body" rows={5} maxLength={50000} defaultValue={n.body} className="w-full rounded border border-stone-700 bg-[#101417] p-2 text-sm text-stone-100"/>
       <button type="submit" className="citem-button-ghost">Save changes</button>
      </form>
      <form action={deleteCountryNote} className="mt-2">{h("delete")}<input type="hidden" name="noteId" value={n.id}/>
       <ConfirmSubmit message="Delete this country note? Linked files remain in Evidence storage."/>
      </form>
     </details>)}
     {notes.length===0&&<p className="text-xs text-stone-500">No country notes yet.</p>}</div>
    </section>
    <section className="min-w-0 rounded border border-stone-800 bg-[#14191d] p-4">
     <h3 className="text-base font-semibold text-stone-100">Linked investigation records <span className="text-xs font-normal text-stone-500">({recordCount})</span></h3>
     <p className="mt-1 text-xs text-stone-500">Relationships express the reason for country relevance. They are not automatically inferred.</p>
     <div className="mt-3 space-y-3">
      <form action={linkCountryRecord} className="space-y-2">{h("link")}
       {selectedTarget?<><input type="hidden" name="targetType" value={selectedTarget.type}/><input type="hidden" name="targetId" value={selectedTarget.id}/>
        <p className="rounded bg-black/20 p-2 text-xs text-amber-200">Selected {selectedTarget.type}: {chosen?.title??selectedTarget.id}</p>
        </>:<>
        <label className="block text-xs text-stone-400">Existing record
         <select name="targetId" required className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200"
          defaultValue={recordOptions[0]?.record_id??""}>
          {recordOptions.map(r=><option key={r.record_type+r.record_id} value={r.record_id}>{r.record_type} · {r.title.slice(0,70)}</option>)}
         </select></label>
        <label className="block text-xs text-stone-400">Record type
         <select name="targetType" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200" defaultValue={recordOptions[0]?.record_type??"SOURCE"}>
           {Array.from(new Set(recordOptions.map(r=>r.record_type))).map(r=><option key={r}>{r}</option>)}
         </select></label>
       </>}
       <label className="block text-xs text-stone-400">Relationship meaning
        <select name="relationType" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200">{relationTypes.map(r=><option key={r}>{r}</option>)}</select></label>
       <label className="block text-xs text-stone-400">Rationale (optional)
        <textarea name="rationale" maxLength={4000} rows={2} className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200"/></label>
       <button type="submit" className="citem-button" disabled={!selectedTarget&&recordOptions.length===0}>Link record to {country.name}</button>
      </form>
      <div className="space-y-2 border-t border-stone-800 pt-3">
        {links.map(l=><div key={l.id} className="rounded bg-black/20 p-3 text-xs">
         <div className="text-stone-200">{l.target_type} · {recordByKey[l.target_type+":"+l.target_id]?.title||l.target_id}</div>
         <p className="mt-1 text-amber-300">{pretty(l.relation_type)}</p>{l.rationale&&<p className="mt-1 text-stone-400">{l.rationale}</p>}
         <form action={unlinkCountryRecord} className="mt-2">{h("unlink")}<input type="hidden" name="linkId" value={l.id}/>
          <ConfirmSubmit label="Remove relationship" message="Remove this country association? The original record will not be deleted."/></form>
        </div>)}
        {links.length===0&&<p className="text-xs text-stone-500">No explicit country relationships yet.</p>}
      </div>
     </div>
    </section>
   </div>
   <section className="rounded border border-stone-800 bg-[#14191d] p-4">
     <h3 className="text-base font-semibold text-stone-100">Files and images <span className="text-xs font-normal text-stone-500">({attachmentCount})</span></h3>
     <p className="mt-1 text-xs text-stone-500">Link private Evidence objects already belonging to this investigation. Removing a link never deletes the original file.</p>
     <form action={attachExistingEvidence} className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      {h("attach")}
      <label className="text-xs text-stone-400">Existing evidence file
       <select name="evidenceId" required className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200">
        {evidenceOptions.map(e=><option key={e.id} value={e.id}>{e.original_file_name||e.title}</option>)}
       </select></label>
      <label className="text-xs text-stone-400">Attach to
       <select name="noteId" className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200">
        <option value="">Country</option>{notes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}
       </select></label>
      <button type="submit" disabled={evidenceOptions.length===0} className="citem-button self-end">Attach</button>
      <label className="text-xs text-stone-400 md:col-span-3">Description<input name="description" maxLength={2000}
       className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-200"/></label>
     </form>
     <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {attachments.map(a=><div key={a.id} className="rounded border border-stone-800 p-3 text-sm">
       <h4 className="break-all text-stone-200">{evidenceById[a.evidence_id]?.original_file_name||evidenceById[a.evidence_id]?.title||a.evidence_id}</h4>
       <p className="mt-1 text-xs text-stone-500">{a.country_note_id?"Attached to country note":"Attached to country"} · {evidenceById[a.evidence_id]?.type||"Evidence"}</p>
       {a.description&&<p className="mt-2 text-xs text-stone-400">{a.description}</p>}
       <div className="mt-2"><EvidenceDownload projectId={projectId} id={a.evidence_id}/></div>
       <form action={detachExistingEvidence} className="mt-2">{h("detach")}<input type="hidden" name="attachmentLinkId" value={a.id}/>
        <ConfirmSubmit label="Detach" message="Detach this file from the country? The original Evidence file is preserved."/></form>
      </div>)}
     </div>
     <details className="mt-4 rounded border border-stone-800 p-3"><summary className="cursor-pointer text-sm text-amber-300">Upload new Evidence</summary>
      <p className="my-3 text-xs text-stone-500">Upload into the existing private Evidence library, then refresh and link the new file above.</p>
      <EvidenceUpload projectId={projectId}/></details>
   </section>
  </>}
 </section>;
}
