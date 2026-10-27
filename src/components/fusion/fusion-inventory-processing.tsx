"use client";
import {useCallback,useEffect,useState} from "react";
import {SourceReaderWorkspace} from "@/components/investigations/source-reader/source-reader-workspace";
import type {loadFusionSourceReader} from "@/lib/fusion/source-reader-data";
import type {FusionInventoryItem} from "@/lib/fusion/types";
type Reader=Awaited<ReturnType<typeof loadFusionSourceReader>>;
type Result={supported:true;reader:Reader}|{supported:false;reason:string};
export function FusionInventoryProcessing({projectId,item,onChanged}:{
 projectId:string;item:FusionInventoryItem;onChanged:()=>void
}){
 const [result,setResult]=useState<Result|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const url="/api/projects/"+projectId+"/fusion/processing?"+
  new URLSearchParams({type:item.record_type,record:item.record_id}).toString();
 const load=useCallback(async()=>{
  const response=await fetch(url,{cache:"no-store"});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error??"Processing context could not be loaded");
  setResult(body as Result);
 },[url]);
 useEffect(()=>{
  let active=true;
  const run=async()=>{
   try{
    const response=await fetch(url,{cache:"no-store"});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error??"Processing context could not be loaded");
    if(active)setResult(body as Result);
   }catch(e){if(active)setError(e instanceof Error?e.message:"Processing unavailable");}
   finally{if(active)setLoading(false);}
  };
  void run();return ()=>{active=false;};
 },[url]);
 const changed=useCallback(()=>{
  onChanged();
  void load().catch(e=>setError(e instanceof Error?e.message:"Unable to refresh processing results"));
 },[load,onChanged]);
 return <div className="min-w-0 space-y-3">
  <div className="rounded border border-amber-900/30 bg-[#14191d] p-3 text-xs text-stone-400">
   <p className="font-semibold text-amber-300">Stage 2 Collection → Stage 3 Processing</p>
   <p className="mt-1">Highlight the original Source, save an annotation, then use <strong>Process / Extract</strong>. The existing menu supports Timeline Events, Source Claims, Indicators, Malware, CVEs, MITRE, Campaigns, Threat Actors and Attribution Claims. No AI processing runs automatically.</p>
  </div>
  {loading&&<p role="status" className="p-4 text-sm text-stone-400">Loading Source Reader and Processing…</p>}
  {error&&<p role="alert" className="rounded border border-red-900 p-4 text-sm text-red-300">{error}
   <button className="ml-3 underline" onClick={()=>{setError("");void load().catch(e=>setError(String(e)));}}>Retry</button></p>}
  {!loading&&result&&!result.supported&&<p role="status" className="rounded border border-stone-800 p-4 text-sm text-stone-400">{result.reason}</p>}
  {!loading&&result?.supported&&
   <SourceReaderWorkspace {...result.reader} embedded onChanged={changed}/>}
 </div>;
}
