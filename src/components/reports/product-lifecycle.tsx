"use client";
import Link from "next/link";
import { useState } from "react";
import { createReportVersion,publishReportVersion,updateProductMetadata } from "@/app/projects/[id]/reports/version-actions";
import { lifecycleStatuses,productTypes } from "@/lib/reports/versioning";
type Row=Record<string,unknown>;
export function ProductLifecycle({projectId,report,versions,authoritativeVersion}:{projectId:string;report:Row;versions:Row[];authoritativeVersion:Row|null}){
 const [message,setMessage]=useState("");
 const act=(p:Promise<{error?:string;success?:string}>)=>p.then(x=>setMessage(x.error??x.success??""));
 return <div className="mt-6 space-y-6">
  <section className="card"><h2 className="text-xl font-semibold">Product metadata</h2><form className="mt-3 grid gap-3 sm:grid-cols-2" action={fd=>act(updateProductMetadata(projectId,String(report.id),{},fd))}>
   <label>Product type<select className="field mt-1" name="productType" defaultValue={String(report.product_type)}>{productTypes.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Lifecycle status<select className="field mt-1" name="lifecycleStatus" defaultValue={String(report.lifecycle_status)}>{!lifecycleStatuses.includes(report.lifecycle_status as never)&&<option disabled>{String(report.lifecycle_status)} (workflow controlled)</option>}{lifecycleStatuses.map(x=><option key={x}>{x}</option>)}</select></label>
   <button className="rounded bg-cyan-400 px-4 py-2 font-semibold text-slate-950 sm:col-span-2">Save product metadata</button>
  </form><p className="mt-2 text-sm text-slate-400">Publication status: {authoritativeVersion?`Version ${String(authoritativeVersion.version_number)} · ${String(authoritativeVersion.version_status)} · issued ${String(authoritativeVersion.published_at)}`:"No version has been issued"}.</p>{authoritativeVersion&&<div className="mt-2 flex gap-3">{["pdf","md","html"].map(f=><a className="text-sm text-cyan-300" key={f} href={`/api/projects/${projectId}/reports/${report.id}/export/${f}?scope=authoritative`}>Authoritative {f.toUpperCase()}</a>)}</div>}</section>
  <section className="card"><h2 className="text-xl font-semibold">Create version</h2><p className="text-sm text-slate-400">Snapshots the saved working draft and its analytical references without publishing it.</p><form className="mt-3 grid gap-3" action={fd=>act(createReportVersion(projectId,String(report.id),{},fd))}>
   {[["changeSummary","Change summary"],["executiveSummary","Executive summary"],["keyJudgments","Key judgments"],["confidence","Confidence"],["intelligenceGaps","Intelligence gaps"],["recommendations","Recommendations"]].map(([n,l])=><label key={n}>{l}<textarea required maxLength={n==="confidence"?100:n==="changeSummary"?2000:20000} className="field mt-1" name={n}/></label>)}
   <button className="rounded bg-cyan-400 px-4 py-2 font-semibold text-slate-950">Create Version</button>
  </form></section>
  <section className="card"><h2 className="text-xl font-semibold">Version history</h2><p className="text-sm text-amber-200">Publishing creates an immutable intelligence record. Later edits require a new version.</p><div className="mt-3 space-y-2">{versions.length===0?<p className="text-slate-400">No versions yet.</p>:versions.map(v=><div className="rounded border border-slate-700 p-3" key={String(v.id)}><div className="flex flex-wrap items-center justify-between gap-2"><Link className="text-cyan-300" href={`/projects/${projectId}/reports/${report.id}/versions/${v.id}`}>Version {String(v.version_number)} · {String(v.version_status)}</Link>{v.id===report.authoritative_version_id&&<strong>Authoritative</strong>}{v.version_status==="SAVED"&&<button className="rounded border border-amber-400 px-3 py-1" type="button" onClick={()=>confirm("Publishing creates an immutable intelligence record. Later edits require a new version. Continue?")&&act(publishReportVersion(projectId,String(report.id),String(v.id)))}>Publish Version</button>}</div><p>{String(v.change_summary)}</p><p className="text-xs text-slate-400">{String(v.product_type_snapshot)} · {String(v.confidence_snapshot)} · {String(v.created_at)}</p></div>)}</div></section>
  <section className="card"><h2 className="text-xl font-semibold">Change awareness</h2><p className="text-sm text-slate-400">Reference snapshots remain historical. Current records may be unchanged, updated, archived, unavailable, or newly added to the draft; changes never rewrite a version or its confidence.</p></section>
  <p aria-live="polite" className="text-sm text-cyan-200">{message}</p>
 </div>;
}
