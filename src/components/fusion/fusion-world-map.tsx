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
 const mapStage=useRef<HTMLDivElement|null>(null);
 const [mapDimensions,setMapDimensions]=useState<[number,number]>([960,480]);
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
  if(!mapStage.current||typeof ResizeObserver==="undefined")return;
  const observer=new ResizeObserver(entries=>{
   if(entries[0])setMapDimensions([entries[0].contentRect.width,entries[0].contentRect.height]);
  });
  observer.observe(mapStage.current);
  return ()=>observer.disconnect();
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
 const capitalAliases:Record<string,string[]>={
  PL:["Warsaw","Warszawa"],TR:["Ankara","Istanbul","İstanbul"],
  US:["Washington","New York","Los Angeles"],GB:["London"],DE:["Berlin"],
  FR:["Paris"],UA:["Kyiv","Kiev"],RU:["Moscow"],CN:["Beijing","Shanghai"],
  JP:["Tokyo"],IT:["Rome"],ES:["Madrid"],IN:["New Delhi","Mumbai"],
  CA:["Ottawa","Toronto"],AU:["Canberra","Sydney"],BR:["Brasilia","Brasília"],
  AR:["Buenos Aires"],MX:["Mexico City"],EG:["Cairo"],SA:["Riyadh"],
  IR:["Tehran"],KR:["Seoul"],ZA:["Pretoria","Johannesburg","Cape Town"],
  NG:["Abuja","Lagos"],DZ:["Algiers"],ID:["Jakarta"],VN:["Hanoi"]
 };
 const matches=countries.filter(c=>
  (!showLinked||linkedCodes.has(c.iso2))&&
  (c.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())||
   c.region?.toLocaleLowerCase().includes(query.toLocaleLowerCase())||
   c.subregion?.toLocaleLowerCase().includes(query.toLocaleLowerCase())||
   capitalAliases[c.iso2]?.some(name=>name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))||
   c.iso2.toLowerCase()===query.toLowerCase()))
  .slice(0,50);
 const zoomBy=(amount:number)=>setZoom(z=>Math.min(8,Math.max(1,z*amount)));
 const pixelsPerUnit=Math.min(Math.max(1,mapDimensions[0])/(W/zoom),Math.max(1,mapDimensions[1])/(H/zoom));
 const approxKm=40075*165/(W*pixelsPerUnit);
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
  <div ref={mapStage} className="citem-worldmap-stage fusion-atlas-stage relative isolate w-full overflow-hidden"
    aria-label="Interactive worldwide country intelligence map">
   <svg viewBox={`${center[0]-W/(zoom*2)} ${center[1]-H/(zoom*2)} ${W/zoom} ${H/zoom}`}
    preserveAspectRatio="xMidYMid meet"
    className="absolute inset-0 h-full w-full touch-none select-none cursor-grab active:cursor-grabbing"
    role="img" aria-label="Interactive map of the world with selectable country boundaries and labels"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
    onPointerCancel={e=>{gesture.current=null;if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>
    <defs>
     {/* Decorative weathering is map-space, so clouds, terrain and lights zoom and pan together. */}
     <filter id="fusion-atlas-cloud-noise" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".016 .031" numOctaves="4" seed="17" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values=".18 0 0 0 .41  0 .18 0 0 .49  0 0 .18 0 .48  .6 .6 .6 0 -.79"/>
     </filter>
     <linearGradient id="fusion-map-land" x1="0" x2="0.95" y1="0" y2="1">
      <stop offset="0" stopColor="#344332"/><stop offset="1" stopColor="#233124"/>
     </linearGradient>
     <linearGradient id="fusion-map-linked" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#536545"/><stop offset="1" stopColor="#3e5037"/>
     </linearGradient>
     <linearGradient id="fusion-map-selected" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#c9963e"/><stop offset="1" stopColor="#886326"/>
     </linearGradient>
    </defs>
    <rect x="0" y="0" width={W} height={H} fill="#061315" pointerEvents="none"/>
    {/* Both NASA equirectangular 2:1 rasters align with the Natural Earth hit-test polygons. */}
    <g aria-hidden="true" pointerEvents="none" className="fusion-atlas-imagery">
     <image href="/api/fusion/atlas-terrain" x={0} y={0} width={W} height={H}
       preserveAspectRatio="none" className="fusion-atlas-terrain"/>
     <image href="/api/fusion/atlas-texture" x={0} y={0} width={W} height={H}
       preserveAspectRatio="none" className="fusion-atlas-satellite"/>
     <rect x={0} y={0} width={W} height={H} fill="#b1bdb3"
       className="fusion-atlas-clouds" filter="url(#fusion-atlas-cloud-noise)"/>
    </g>
    {/* Offline-safe land silhouettes: map still works if an imagery provider is unreachable. */}
    <g aria-hidden="true" pointerEvents="none" fill="#30413a" className="fusion-atlas-vector-fallback">
      {mapShapes.map(f=><path key={"terrain-"+f.id} d={f.path}/>)}
    </g>
    <g aria-hidden="true" pointerEvents="none" stroke="#817961" strokeOpacity=".08" strokeWidth={.35/zoom}>
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
        className={`fusion-map-country fusion-atlas-country ${chosen?"is-selected":linked?"has-intelligence":""}`}
        fill={chosen?"rgba(188,133,57,.25)":linked?"rgba(186,135,70,.095)":"rgba(19,37,32,.035)"}
        stroke={chosen?"#e3b96d":linked?"#bd9d68":"#ab8c62"}
        strokeWidth={(chosen?1.25:linked?.69:.53)/zoom} strokeOpacity={chosen?1:.78}
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
    <g aria-hidden="true" pointerEvents="none" className="fusion-atlas-ocean-labels">
      {[
       ["A R C T I C   O C E A N",725,25],
       ["A T L A N T I C",370,200],["O C E A N",370,219],
       ["P A C I F I C",84,230],["O C E A N",84,248],
       ["I N D I A N",694,306],["O C E A N",694,324],
       ["S O U T H E R N  O C E A N",485,452]
      ].map(([label,x,y],i)=><text key={i} x={Number(x)} y={Number(y)}
       fontSize={8.2/zoom} fill="#9baca9" opacity=".63"
       textAnchor="middle" letterSpacing={2/zoom}>{label}</text>)}
    </g>
    <g aria-hidden="true" pointerEvents="none" className="fusion-map-labels fusion-atlas-labels">
     {displayedLabels.map(label=><text key={label.code}
       x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle"
       fontSize={(label.area>1000?9.3:8.4)/zoom} letterSpacing={1.16/zoom}
       stroke="#0c1617" strokeWidth={1.85/zoom} paintOrder="stroke"
       fill={popupCountry===label.code?"#f4d8a9":"#d9d6cb"}
       className="fusion-map-country-name">{label.label}</text>)}
    </g>
   </svg>
   <aside className="fusion-atlas-search" aria-label="Country quick search">
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
    <input aria-label="Find a country or territory" value={query} onChange={e=>setQuery(e.target.value)}
      placeholder="Search countries, regions, or cities..." maxLength={100}
      className="fusion-atlas-search-input"/>
    <button aria-label="Toggle linked-country filter" title="Show only countries with linked material"
      type="button" onClick={()=>setShowLinked(v=>!v)} aria-pressed={showLinked}
      className="fusion-atlas-filter-toggle">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4">
       <path d="M4 7h16M4 17h16"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/>
      </svg>
    </button>
    {query.trim()!==""&&<div className="fusion-atlas-results" aria-label="Country search results">
     {matches.map(c=><button type="button" key={c.iso2} onClick={()=>{go(c.iso2);setQuery("");}}
      className="fusion-atlas-search-item"><span>{c.name}</span><span>{c.iso2}</span></button>)}
     {matches.length===0&&<p className="p-2 text-xs text-stone-400">No matching countries.</p>}
    </div>}
   </aside>
   <div className="fusion-atlas-compass" aria-hidden="true">
    <svg viewBox="0 0 70 70" width="70" height="70">
     <circle cx="35" cy="35" r="21" stroke="#a6b2ac" strokeWidth=".7" fill="none"/>
     <circle cx="35" cy="35" r="14" stroke="#a6b2ac" strokeWidth=".5" fill="none"/>
     <path d="M35 8 39 32 35 35 31 32Z M62 35 38 39 35 35 38 31Z M35 62 31 38 35 35 39 38Z M8 35 32 31 35 35 32 39Z"
      fill="#afb5ac" opacity=".7"/>
     <path d="M35 9V61M9 35H61" stroke="#d7d4c3" strokeWidth=".4"/>
     <g fontSize="7" textAnchor="middle" fill="#d1d4c8" fontFamily="Georgia, serif">
      <text x="35" y="6">N</text><text x="35" y="69">S</text><text x="65" y="37">E</text><text x="5" y="37">W</text>
     </g>
    </svg>
   </div>
   <div className="fusion-atlas-scale" aria-label="Approximate map scale at the equator">
    <div className="fusion-atlas-scale-text"><span>0</span>
     <span>{Math.round(approxKm*.2).toLocaleString("en-US")}</span>
     <span>{Math.round(approxKm*.5).toLocaleString("en-US")}</span>
     <span>{Math.round(approxKm).toLocaleString("en-US")} km</span></div>
    <div className="fusion-atlas-scale-rule"/>
   </div>
   <div className="fusion-atlas-controls">
    <div className="fusion-atlas-zoom">
     <button type="button" aria-label="Zoom in" onClick={()=>zoomBy(1.3)}>+</button>
     <button type="button" aria-label="Zoom out" onClick={()=>zoomBy(1/1.3)}>−</button>
    </div>
    <button type="button" className="fusion-atlas-recenter" aria-label="Reset map view"
      onClick={()=>{setZoom(1);setCenter([W/2,H/2]);}}>
     <svg aria-hidden="true" viewBox="0 0 20 20" width="17" height="17" stroke="currentColor" fill="none" strokeWidth="1.2">
      <circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="2"/>
      <path d="M10 0v4M10 16v4M0 10h4M16 10h4"/>
     </svg>
    </button>
   </div>
   <span className="fusion-atlas-corner-status" aria-live="polite">{hover||selected?.name||""} · {Math.round(zoom*100)}%</span>
  </div>
  {popupCountry&&<CountryIntelligencePopup key={popupCountry} projectId={projectId} code={popupCountry} onClose={close} onCountry={switchCountry} preset={preset}/>}
 </section>;
}
