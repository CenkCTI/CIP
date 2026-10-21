"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import type { Stage3CandidateResponse } from "@/lib/ai/stage3/candidates";
import { aggregateDocumentCandidates,DocumentCandidateLimit } from "@/lib/ai/stage3/document-aggregation";

export type ScanSelection={kind:"document"}|{kind:"pages";pageStart:number;pageEnd:number};
export type ScanChunk={chunkId:string;ordinal:number;pageStart:number;pageEnd:number;chars:number};
export type ScanManifest={fingerprint:string;scanVersion:string;pageCount:number;chunks:ScanChunk[];
  limits:{chunkChars:number;overlap:number;maxChunks:number;maxCandidates:number;maxSelectedPages:number;concurrency:number}};
export type DocumentScanStatus="preparing"|"running"|"paused"|"with_gaps"|"complete"|"cancelled"|"limit_reached";
export type DocumentScanView={status:DocumentScanStatus;total:number;completed:number;empty:number;
  failed:{chunkId:string;code:string;pages:string}[];pending:number;
  result:Stage3CandidateResponse;error:string};
type Run={manifest:ScanManifest;selection:ScanSelection;responses:Map<string,Stage3CandidateResponse>;
  failed:Map<string,string>;pending:string[];status:DocumentScanStatus;error:string};
type ApiFailure={code?:string;error?:string;stage?:string};
function msg(error:unknown){return error instanceof Error?error.message:"Request failed";}
export function useDocumentExtraction(projectId:string,sourceId:string,assetId:string){
  const runRef=useRef<Run|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const [view,setView]=useState<DocumentScanView|null>(null);
  const [working,setWorking]=useState(false);
  const [dismissed,setDismissed]=useState<Set<string>>(()=>new Set());
  const base="/api/projects/"+projectId+"/ai/processing/document/";
  const publish=useCallback((run:Run)=>{
    if(runRef.current!==run)return;
    const completed=run.responses.size;
    const values=Array.from(run.responses.values());
    const empty=values.filter(v=>!v.candidates.length).length;
    const result=aggregateDocumentCandidates(values,run.manifest.limits.maxCandidates);
    setView({status:run.status,total:run.manifest.chunks.length,completed,empty,
      failed:[...run.failed].map(([chunkId,code])=>{
        const c=run.manifest.chunks.find(x=>x.chunkId===chunkId);
        return {chunkId,code,pages:c?String(c.pageStart)+"-"+String(c.pageEnd):"unknown"};
      }),pending:run.pending.length,result,error:run.error});
  },[]);

  const processRun=useCallback(async(run:Run)=>{
    const abort=new AbortController();
    abortRef.current=abort;
    setWorking(true);run.status="running";run.error="";
    try{
      publish(run);
      const concurrency=Math.min(2,run.manifest.limits.concurrency);
      while(run.pending.length && !abort.signal.aborted){
        const batch=run.pending.splice(0,concurrency);
        let mustPause=false;
        await Promise.all(batch.map(async(chunkId)=>{
          try{
            const response=await fetch(base+"chunk",{method:"POST",
              headers:{"content-type":"application/json"},
              body:JSON.stringify({sourceId,assetId,selection:run.selection,chunkId,
                fingerprint:run.manifest.fingerprint,byokConsent:true}),
              signal:abort.signal,cache:"no-store"});
            const body=await response.json() as {result?:Stage3CandidateResponse;chunkId?:string}&ApiFailure;
            if(!response.ok||!body.result||body.chunkId!==chunkId){
              const code=body.code??"invalid_response";
              if(["rate_limited","provider_rate_limited","quota_unavailable",
                  "byok_expired","byok_required","provider_unreachable","timeout"].includes(code)){
                mustPause=true;run.error=code;
                run.pending.push(chunkId);
              }else{run.failed.set(chunkId,code);}
            }else if(!abort.signal.aborted){
              run.responses.set(chunkId,body.result);
              run.failed.delete(chunkId);
            }
          }catch(error){
            if(!abort.signal.aborted){
              mustPause=true;run.error=msg(error);run.pending.push(chunkId);
            }
          }
        }));
        if(abort.signal.aborted){
          // Cancel is not a completed scan; abort does not refund quota.
          batch.filter(id=>!run.responses.has(id)&&!run.failed.has(id)).forEach(id=>run.pending.push(id));
          break;
        }
        try{publish(run);}catch(error){
          if(error instanceof DocumentCandidateLimit){
            run.status="limit_reached";run.error="More than 150 distinct candidates. Select a narrower range.";
            run.pending=[];break;
          }
          throw error;
        }
        if(mustPause){run.status="paused";break;}
      }
      if(abort.signal.aborted)run.status="cancelled";
      else if(run.status!=="paused" && run.status!=="limit_reached")
        run.status=run.failed.size?"with_gaps":"complete";
      try{publish(run);}catch(error){
        if(error instanceof DocumentCandidateLimit){
          run.status="limit_reached";run.error="Candidate limit reached. Select fewer pages.";
          // publish with bounded placeholder rather than misreporting a complete run.
          setView(v=>v?{...v,status:"limit_reached",error:run.error}:v);
        }else throw error;
      }
    }finally{
      if(abortRef.current===abort)abortRef.current=null;
      setWorking(false);
    }
  },[assetId,base,publish,sourceId]);

  const start=useCallback(async(selection:ScanSelection)=>{
    abortRef.current?.abort();
    runRef.current=null;setDismissed(new Set());setView(null);setWorking(true);
    const abort=new AbortController();abortRef.current=abort;
    setView({status:"preparing",total:0,completed:0,empty:0,failed:[],pending:0,
      result:{candidates:[],discarded:0,warnings:[]},error:""});
    try{
      const response=await fetch(base+"prepare",{method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({sourceId,assetId,selection}),signal:abort.signal,cache:"no-store"});
      const body=await response.json() as {manifest?:ScanManifest}&ApiFailure;
      if(!response.ok||!body.manifest)
        throw new Error((body.error??body.code??"Unable to prepare scan").slice(0,300));
      if(abort.signal.aborted)return;
      const manifest=body.manifest;
      if(!manifest.chunks.length||manifest.chunks.length>24)throw new Error("Invalid scan manifest");
      const run:Run={manifest,selection,responses:new Map(),failed:new Map(),
        pending:manifest.chunks.map(c=>c.chunkId),status:"running",error:""};
      runRef.current=run;
      await processRun(run);
    }catch(error){
      if(!abort.signal.aborted){
        setView(v=>v?{...v,status:"paused",error:msg(error)}:v);
      }
    }finally{
      if(abortRef.current===abort)abortRef.current=null;
      setWorking(false);
    }
  },[assetId,base,processRun,sourceId]);

  const resume=useCallback(async(retryFailed=false)=>{
    const run=runRef.current;
    if(!run||working)return;
    if(retryFailed){
      run.pending.push(...run.failed.keys());
      run.failed.clear();
    }
    if(!run.pending.length)return;
    await processRun(run);
  },[processRun,working]);
  const cancel=useCallback(()=>{abortRef.current?.abort();},[]);
  const dismiss=useCallback((id:string)=>setDismissed(previous=>new Set([...previous,id])),[]);
  useEffect(()=>()=>{abortRef.current?.abort();},[]);
  return {view,working,start,resume,cancel,dismissed,dismiss};
}
