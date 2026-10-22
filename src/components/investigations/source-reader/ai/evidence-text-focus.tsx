"use client";
import {useEffect,useRef,useState} from "react";

/** Five-second, non-persistent focus of already-displayed external excerpts.
 * Search snippets are leads, never verified evidence. External websites remain
 * cross-origin and cannot be modified or scrolled by this component. */
export function EvidenceTextFocus({children,label="Focus excerpt",kind="evidence"}:{
  children:React.ReactNode;label?:string;kind?:"evidence"|"lead"|"context";
}){
  const [nonce,setNonce]=useState(0);
  const [active,setActive]=useState(false);
  const textRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!nonce)return;
    const timeout=window.setTimeout(()=>setActive(false),5000);
    return()=>window.clearTimeout(timeout);
  },[nonce]);
  return <div className="citem-evidence-inline-root" data-evidence-kind={kind}>
    <div ref={textRef} data-testid="web-evidence-text"
      className={"citem-evidence-inline-text"+(active?" citem-evidence-inline-active":"")}
      key={nonce}>
      {children}
    </div>
    <button type="button"
      aria-label={label}
      className="mt-1 rounded border border-[var(--amber-dark)] px-2 py-1 text-[11px] font-semibold text-[var(--amber-soft)] hover:bg-[var(--amber-tint)]"
      onClick={()=>{
        setActive(true);
        setNonce(v=>v+1);
        const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        textRef.current?.scrollIntoView?.({behavior:reduced?"auto":"smooth",block:"center"});
      }}>
      ◎ {label}
    </button>
  </div>;
}
