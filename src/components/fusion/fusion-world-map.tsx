"use client";
import Link from "next/link";
import { useMemo,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import countries from "@/lib/fusion/countries.json";
import world from "@/lib/fusion/world-110m.json";

type GeoFeature={type:string;id:string;properties:{name:string};geometry:{type:string;coordinates:number[][][]|number[][][][]}};
type CountryCount={links:number;notes:number;attachments:number};
const W=960,H=480;
const xy=(p:number[])=>[(p[0]+180)*W/360,(90-p[1])*H/180];
function ringPath(ring:number[][]){
 let result="";let prev:number[]|null=null;
 for(const p of ring){
  const point=xy(p);
  if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue;
  const wrap=prev&&Math.abs(point[0]-prev[0])>W/2;
  result+=(prev&&!wrap?"L":"M")+point[0].toFixed(2)+","+point[1].toFixed(2);
  prev=point;
 }
 return result+"Z";
}
function geometryPath(g:GeoFeature["geometry"]){
 const polys=(g.type==="Polygon"?[g.coordinates]:g.coordinates) as number[][][][];
 return polys.map(poly=>poly.map(ringPath).join(" ")).join(" ");
}
export function FusionWorldMap({projectId,selectedCountry,counts}:{
 projectId:string;selectedCountry:string;counts:Record<string,CountryCount>
}){
 const router=useRouter();
 const [zoom,setZoom]=useState(1);
 const [center,setCenter]=useState<[number,number]>([W/2,H/2]);
 const [query,setQuery]=useState("");
 const [showLinked,setShowLinked]=useState(false);
 const [hover,setHover]=useState("");
 const gesture=useRef<{x:number;y:number;cx:number;cy:number;dragged:boolean}|null>(null);
 const shapes=useMemo(()=>(world.features as GeoFeature[]).map(f=>({...f,path:geometryPath(f.geometry)})),[]);
 const known=new Set(shapes.map(f=>f.id));
 const iso3to2=new Map(countries.map(c=>[c.iso3,c.iso2]));
 const selected=countries.find(c=>c.iso2===selectedCountry);
 const matches=countries.filter(c=>
   (!showLinked||((counts[c.iso2]?.links??0)+(counts[c.iso2]?.notes??0)+(counts[c.iso2]?.attachments??0)>0))
   && (c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())||c.iso2.toLowerCase()===query.toLowerCase()))
   .slice(0,100);
 const go=(code:string)=>router.push(`/projects/${projectId}/fusion?view=map&country=${encodeURIComponent(code)}`);
 const zoomBy=(delta:number)=>setZoom(z=>Math.min(8,Math.max(1,z*delta)));
 return <section className="space-y-4">
  <header><p className="citem-label">Investigation / Fusion</p><h1 className="mt-1 text-2xl font-semibold text-stone-100">World Map</h1>
   <p className="mt-1 text-xs text-stone-500">Geographic organization · Country associations are analyst-controlled, not an assessed threat index.</p></header>
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
   <div className="min-w-0 overflow-hidden rounded border border-stone-800 bg-[#101417]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 p-2 text-xs text-stone-400">
      <div className="flex gap-2">
       <button type="button" onClick={()=>zoomBy(1.3)} className="citem-button-ghost" aria-label="Zoom in">＋</button>
       <button type="button" onClick={()=>zoomBy(1/1.3)} className="citem-button-ghost" aria-label="Zoom out">－</button>
       <button type="button" onClick={()=>{setZoom(1);setCenter([W/2,H/2]);}} className="citem-button-ghost">Reset</button>
      </div><span>{hover||"Select a country or drag to pan"} · {Math.round(zoom*100)}%</span>
    </div>
    <svg viewBox={`${center[0]-W/(zoom*2)} ${center[1]-H/(zoom*2)} ${W/zoom} ${H/zoom}`}
     className="h-auto w-full cursor-grab touch-none select-none" role="img" aria-label="Interactive map of the world, with selectable country boundaries"
     onPointerDown={e=>{gesture.current={x:e.clientX,y:e.clientY,cx:center[0],cy:center[1],dragged:false};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e=>{
      const start=gesture.current;
      if(!start)return;
      const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(Math.abs(dx)+Math.abs(dy)>4)start.dragged=true;
      if(start.dragged){const box=e.currentTarget.getBoundingClientRect();setCenter([Math.min(W,Math.max(0,start.cx-dx*W/(box.width*zoom))),Math.min(H,Math.max(0,start.cy-dy*H/(box.height*zoom)))]);}
     }}
     onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);setTimeout(()=>{gesture.current=null;},0);}}
     onPointerCancel={()=>{gesture.current=null;}}>
     <rect x="0" y="0" width={W} height={H} fill="#101417"/>
     <g stroke="#0b0e11" strokeWidth={Math.max(0.2,0.8/zoom)} strokeLinejoin="round">
      {shapes.map(f=>{
       const code=iso3to2.get(f.id);
       const total=code?(counts[code]?.links??0)+(counts[code]?.notes??0)+(counts[code]?.attachments??0):0;
       const chosen=code===selectedCountry;
       return <path key={f.id} d={f.path} fill={chosen?"#b9822f":total>0?"#5b584f":"#30383c"}
         stroke={chosen?"#d4a958":"#0b0e11"} role={code?"button":undefined}
         tabIndex={code?0:undefined} aria-label={code?`${f.properties.name}: ${total} linked materials`:f.properties.name}
         onMouseEnter={()=>setHover(f.properties.name)} onMouseLeave={()=>setHover("")}
         onKeyDown={e=>{if(code&&(e.key==="Enter"||e.key===" ")){e.preventDefault();go(code);}}}
         onClick={()=>{if(code&&!gesture.current?.dragged)go(code);}}
         className={code?"cursor-pointer outline-none focus:stroke-amber-300 hover:fill-[#877041]":""}/>;
      })}
     </g>
    </svg>
    <div className="flex items-center gap-3 border-t border-stone-800 p-3 text-[11px] text-stone-400">
     <span><span className="mr-1 inline-block h-2 w-2 bg-[#30383c]"/>No linked material</span>
     <span><span className="mr-1 inline-block h-2 w-2 bg-[#5b584f]"/>Linked material</span>
     <span><span className="mr-1 inline-block h-2 w-2 bg-[#b9822f]"/>Selected</span>
    </div>
   </div>
   <aside className="rounded border border-stone-800 bg-[#14191d] p-4">
     <label className="block text-xs text-stone-400">Find a country or territory
      <input className="mt-1 w-full rounded border border-stone-700 bg-[#101417] p-2 text-stone-100" placeholder="Poland, Türkiye, JP..."
       value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/></label>
     <label className="mt-3 flex gap-2 text-xs text-stone-400"><input type="checkbox" checked={showLinked} onChange={e=>setShowLinked(e.target.checked)}/> With linked material only</label>
     <div className="mt-3 max-h-40 overflow-y-auto rounded border border-stone-800" aria-label="Country search results">
      {matches.map(c=><button key={c.iso2} type="button" onClick={()=>go(c.iso2)}
       className={`flex w-full justify-between gap-2 border-b border-stone-800 px-2 py-1.5 text-left text-xs hover:bg-stone-800 ${c.iso2===selectedCountry?"text-amber-300":"text-stone-300"}`}>
       <span>{c.name}</span><span className="text-stone-500">{c.iso2}</span></button>)}
      {matches.length===0&&<p className="p-3 text-xs text-stone-500">No countries match this search.</p>}
     </div>
     {selected?<div className="mt-5 space-y-3 border-t border-stone-800 pt-4">
      <div><p className="citem-label">Selected country</p><h2 className="mt-1 text-xl font-semibold text-stone-100">{selected.name} <span className="text-sm text-stone-500">{selected.iso2} / {selected.iso3}</span></h2>
       <p className="mt-1 text-xs text-stone-500">{selected.region} · {selected.subregion}</p></div>
      <p className="text-xs text-stone-400">{known.has(selected.iso3)?"World polygon available":"No polygon in Natural Earth 110m; country remains available here."}</p>
      <dl className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded bg-black/20 p-2"><dt className="text-stone-500">Links</dt><dd className="text-base text-stone-200">{counts[selected.iso2]?.links??0}</dd></div>
      <div className="rounded bg-black/20 p-2"><dt className="text-stone-500">Notes</dt><dd className="text-base text-stone-200">{counts[selected.iso2]?.notes??0}</dd></div>
      <div className="rounded bg-black/20 p-2"><dt className="text-stone-500">Files</dt><dd className="text-base text-stone-200">{counts[selected.iso2]?.attachments??0}</dd></div></dl>
      <Link className="citem-button inline-block" href={`/projects/${projectId}/fusion?view=countries&country=${selected.iso2}`}>Open country workspace</Link>
      <Link className="block text-xs text-amber-300 underline" href={`/projects/${projectId}/fusion?view=inventory&country=${selected.iso2}`}>View country-linked inventory</Link>
     </div>:<p className="mt-4 text-xs text-stone-500">Select any of the 249 catalog entries to open its country workspace.</p>}
    </aside>
  </div>
 </section>;
}
