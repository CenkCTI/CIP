"use client";

import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import countries from "@/lib/fusion/countries.json";
import world from "@/lib/fusion/world-110m.json";
import {
 MAP_WIDTH,MAP_HEIGHT,geometryPath,getWorldLabels,visibleMapLabels,
 type WorldFeature
} from "@/lib/fusion/world-map-labels";
import { CountryIntelligencePopup } from "./country-intelligence-popup";

type CountryCount={links:number;notes:number;attachments:number};
const W=MAP_WIDTH,H=MAP_HEIGHT;
const countryLookup=Object.fromEntries(countries.map(c=>[c.iso3,{code:c.iso2,name:c.name}]));
const iso3to2=new Map(countries.map(c=>[c.iso3,c.iso2]));
const features=world.features as WorldFeature[];
const mapShapes=features.map(f=>({...f,path:geometryPath(f.geometry)}));
const mapLabels=getWorldLabels(features,countryLookup);

export function FusionWorldMap({projectId,selectedCountry,counts,preset}:{
 projectId:string;selectedCountry:string;counts:Record<string,CountryCount>;preset?:{type:string;id:string}|null
}){
 const router=useRouter();
 const [popupCountry,setPopupCountry]=useState(selectedCountry);
 const previousFocus=useRef<HTMLElement|null>(null);
 const [zoom,setZoom]=useState(1);
 const [center,setCenter]=useState<[number,number]>([W/2,H/2]);
 const [query,setQuery]=useState("");
 const [showLinked,setShowLinked]=useState(false);
 const [hover,setHover]=useState("");
 const gesture=useRef<{x:number;y:number;cx:number;cy:number;dragged:boolean}|null>(null);
 const suppressClick=useRef(false);
 const makeUrl=(code:string)=>{
  const u=new URL(window.location.href);
  u.searchParams.set("view","map");
  if(code)u.searchParams.set("country",code);else u.searchParams.delete("country");
  u.searchParams.delete("countryId");
  return u.pathname+u.search+u.hash;
 };
 const go=useCallback((code:string)=>{
  previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  setPopupCountry(code);
  window.history.pushState(null,"",makeUrl(code));
 },[]);
 const close=useCallback(()=>{
  setPopupCountry("");
  window.history.replaceState(null,"",makeUrl(""));
  window.requestAnimationFrame(()=>previousFocus.current?.focus());
 },[]);
 const switchCountry=useCallback((code:string)=>{
  setPopupCountry(code);window.history.replaceState(null,"",makeUrl(code));
 },[]);
 useEffect(()=>{
  const pop=()=>{
   const code=new URLSearchParams(window.location.search).get("country")??"";
   setPopupCountry(countries.some(c=>c.iso2===code)?code:"");
  };
  window.addEventListener("popstate",pop);
  return ()=>window.removeEventListener("popstate",pop);
 },[]);
 useEffect(()=>{
  const refresh=()=>router.refresh();
  window.addEventListener("fusion-country-updated",refresh);
  return ()=>window.removeEventListener("fusion-country-updated",refresh);
 },[router]);
 const linkedCodes=useMemo(()=>new Set(Object.entries(counts).filter(([,c])=>c.links+c.notes+c.attachments>0).map(([code])=>code)),[counts]);
 const displayedLabels=useMemo(()=>visibleMapLabels(mapLabels,zoom,center,linkedCodes),[zoom,center,linkedCodes]);
 const totalLinked=linkedCodes.size;
 const selected=countries.find(c=>c.iso2===popupCountry);
 const matches=countries.filter(c=>
  (!showLinked||linkedCodes.has(c.iso2))&&
  (c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())||c.iso2.toLowerCase()===query.toLowerCase()))
  .slice(0,50);
 const zoomBy=(amount:number)=>setZoom(z=>Math.min(8,Math.max(1,z*amount)));
 const onPointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
  if(e.button!==0)return;
  gesture.current={x:e.clientX,y:e.clientY,cx:center[0],cy:center[1],dragged:false};
  suppressClick.current=false;
  // A tap/click remains on the country path. Capturing immediately on the SVG
  // would retarget the click to the parent and prevent the Country Popup opening.
 };
 const onPointerMove=(e:React.PointerEvent<SVGSVGElement>)=>{
  const start=gesture.current;if(!start)return;
  const dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(!start.dragged&&Math.hypot(dx,dy)>6){
   start.dragged=true;suppressClick.current=true;
   if(e.currentTarget.setPointerCapture && !e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.setPointerCapture(e.pointerId);
  }
  if(!start.dragged)return;
  const bounds=e.currentTarget.getBoundingClientRect();
  if(!bounds.width||!bounds.height)return;
  const scale=W/(bounds.width*zoom);
  setCenter([
   Math.max(0,Math.min(W,start.cx-dx*scale)),
   Math.max(0,Math.min(H,start.cy-dy*H/(bounds.height*zoom)))
  ]);
 };
 const onPointerUp=(e:React.PointerEvent<SVGSVGElement>)=>{
  const dragged=gesture.current?.dragged??false;
  suppressClick.current=dragged;
  gesture.current=null;
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 return <section className="fusion-map-workspace" aria-label="Fusion World Map">
  <header className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-3 sm:px-6">
   <div>
    <p className="citem-label">FUSION / GEOSPATIAL WORKSPACE</p>
    <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#e8e1d6]">World Map <span className="ml-2 align-middle font-mono text-[10px] font-normal tracking-[.18em] text-[#91b4b2]">GLOBAL VIEW</span></h1>
    <p className="mt-1 text-xs text-stone-500">Select a country to open its Intelligence Brief · Analyst-linked records only</p>
   </div>
   <span className="font-mono text-[10px] tracking-[.2em] text-[#81918f]">COUNTRY INTELLIGENCE / 249 ISO ENTRIES</span>
  </header>
  <div className="citem-worldmap-stage relative isolate w-full overflow-hidden"
    aria-label="Interactive worldwide country intelligence map">
   <div className="citem-worldmap-hud-corner citem-worldmap-hud-corner--tl" aria-hidden="true"/>
   <div className="citem-worldmap-hud-corner citem-worldmap-hud-corner--tr" aria-hidden="true"/>
   <div className="citem-worldmap-hud-corner citem-worldmap-hud-corner--bl" aria-hidden="true"/>
   <div className="citem-worldmap-hud-corner citem-worldmap-hud-corner--br" aria-hidden="true"/>
   <svg viewBox={`${center[0]-W/(zoom*2)} ${center[1]-H/(zoom*2)} ${W/zoom} ${H/zoom}`}
    preserveAspectRatio="xMidYMid meet"
    className="absolute inset-0 h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
    role="img" aria-label="Interactive map of the world with selectable country boundaries and labels"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
    onPointerCancel={e=>{gesture.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
    <defs>
     <linearGradient id="fusion-map-land" x1="0" x2="0.95" y1="0" y2="1">
      <stop offset="0" stopColor="#3e535a"/><stop offset="1" stopColor="#293b43"/>
     </linearGradient>
     <linearGradient id="fusion-map-linked" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#59736b"/><stop offset="1" stopColor="#344d4b"/>
     </linearGradient>
     <linearGradient id="fusion-map-selected" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#e2b766"/><stop offset="1" stopColor="#a47030"/>
     </linearGradient>
    </defs>
    <rect x="0" y="0" width={W} height={H} fill="transparent"/>
    <g aria-hidden="true" pointerEvents="none" stroke="#5c9694" strokeOpacity=".13" strokeWidth={.55/zoom}>
     {Array.from({length:11},(_,i)=><line key={`lon-${i}`} x1={i*W/10} y1="0" x2={i*W/10} y2={H}/>)}
     {Array.from({length:7},(_,i)=><line key={`lat-${i}`} x1="0" y1={i*H/6} x2={W} y2={i*H/6}/>)}
    </g>
    <g strokeLinejoin="round">
     {mapShapes.map(f=>{
      const code=iso3to2.get(f.id);
      const linked=code?linkedCodes.has(code):false;
      const chosen=code===popupCountry;
      const count=code?(counts[code]?.links??0)+(counts[code]?.notes??0)+(counts[code]?.attachments??0):0;
      return <path key={f.id} d={f.path}
        className={`fusion-map-country ${chosen?"is-selected":linked?"has-intelligence":""}`}
        fill={chosen?"url(#fusion-map-selected)":linked?"url(#fusion-map-linked)":"url(#fusion-map-land)"}
        stroke={chosen?"#f5c878":linked?"#638f88":"#111c21"}
        strokeWidth={(chosen?1.4:0.78)/zoom}
        role={code?"button":undefined} tabIndex={code?0:undefined}
        aria-label={code?`${f.properties.name}: ${count} linked materials`:f.properties.name}
        onMouseEnter={()=>setHover(f.properties.name)} onMouseLeave={()=>setHover("")}
        onFocus={()=>setHover(f.properties.name)} onBlur={()=>setHover("")}
        onKeyDown={e=>{if(code&&(e.key==="Enter"||e.key===" ")){e.preventDefault();go(code);}}}
        onClick={()=>{if(code&&!suppressClick.current)go(code);}}>
        <title>{code?`${f.properties.name} · Open Country Intelligence Brief`:f.properties.name}</title>
       </path>;
     })}
    </g>
    <g aria-hidden="true" pointerEvents="none" className="fusion-map-labels">
     {displayedLabels.map(label=><text key={label.code}
       x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle"
       fontSize={(label.area>1000?11.5:9)/zoom} letterSpacing={.45/zoom}
       stroke="#0b151a" strokeWidth={2.8/zoom} paintOrder="stroke"
       fill={popupCountry===label.code?"#ffe5a8":linkedCodes.has(label.code)?"#e4d6ad":"#bdcbcf"}
       className="font-mono font-medium">{label.label}</text>)}
    </g>
   </svg>
   <div className="pointer-events-none absolute left-5 top-5 z-10 hidden font-mono text-[10px] tracking-[.15em] text-[#7da6a4] sm:block" aria-hidden="true">
    <span className="block opacity-70">BAYKUSH / CİTEM</span>
    <span className="block opacity-50">GEOINT · WORLD PROJECTION</span>
   </div>
   <div className="absolute bottom-16 left-3 z-10 flex gap-1.5 sm:bottom-auto sm:left-5 sm:top-20">
    <button type="button" onClick={()=>zoomBy(1.3)} className="fusion-map-control" aria-label="Zoom in">+</button>
    <button type="button" onClick={()=>zoomBy(1/1.3)} className="fusion-map-control" aria-label="Zoom out">−</button>
    <button type="button" onClick={()=>{setZoom(1);setCenter([W/2,H/2]);}} className="fusion-map-control px-3">Reset</button>
   </div>
   <aside className="fusion-map-search absolute right-3 top-3 z-10 w-[min(320px,calc(100%-1.5rem))] sm:right-5 sm:top-5" aria-label="Country quick search">
    <label className="block text-[10px] font-semibold uppercase tracking-[.17em] text-[#aabfbd]">Find country / territory
     <input aria-label="Find a country or territory" className="mt-2 w-full rounded border border-[#416261]/65 bg-[#0b171b]/90 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-600 focus:border-amber-400"
      value={query} onChange={e=>setQuery(e.target.value)} placeholder="Poland, Türkiye, JP..." maxLength={100}/>
    </label>
    <label className="mt-2 flex items-center gap-2 text-[11px] text-[#acb9b9]">
     <input type="checkbox" checked={showLinked} onChange={e=>setShowLinked(e.target.checked)} className="accent-[#b9822f]"/>
     With linked material only
    </label>
    {query.trim()!==""&&<div className="mt-2 max-h-56 overflow-y-auto border-t border-[#456967]/35 pt-1" aria-label="Country search results">
      {matches.map(c=><button type="button" key={c.iso2} onClick={()=>{go(c.iso2);setQuery("");}}
       className="flex w-full justify-between gap-3 px-2 py-1.5 text-left text-xs text-[#d3dcda] hover:bg-[#36504c]/40 focus-visible:bg-[#36504c]/40">
       <span>{c.name}</span><span className="font-mono text-amber-300">{c.iso2}</span>
      </button>)}
      {matches.length===0&&<p className="p-2 text-xs text-stone-400">No matching countries.</p>}
    </div>}
   </aside>
   <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-[#43645f]/30 bg-[#0a1418]/85 px-4 py-2.5 font-mono text-[10px] tracking-wide text-[#b2c4c0] backdrop-blur-sm sm:px-6">
    <span>{hover||selected?.name||"SELECT TERRITORY TO OPEN INTELLIGENCE"} <span className="text-amber-300">· {Math.round(zoom*100)}%</span></span>
    <span className="flex flex-wrap gap-3"><span><i className="mr-1 inline-block h-2 w-2 bg-[#445860]"/>UNLINKED</span>
     <span><i className="mr-1 inline-block h-2 w-2 bg-[#607e70]"/>LINKED</span>
     <span><i className="mr-1 inline-block h-2 w-2 bg-[#d4a958]"/>SELECTED</span>
     <span className="hidden text-[#80a8a2] sm:inline">ACTIVE COUNTRIES {totalLinked}</span></span>
   </div>
  </div>
  <p className="px-4 py-2 text-[11px] text-stone-500 sm:px-6">
   Names adapt to zoom to avoid overlap. Small countries and territories without 110m polygons remain accessible through search. Geographic links are analyst-authored, not threat scores.
  </p>
  {popupCountry&&<CountryIntelligencePopup key={popupCountry} projectId={projectId} code={popupCountry} onClose={close} onCountry={switchCountry} preset={preset}/>}
 </section>;
}
