"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSourceAnnotationV2 } from "@/app/projects/[id]/source-collection-actions";
import {
  clientRectToPdfQuad,
  mergeClientRects,
  pdfQuadToViewportPoints,
  pointInQuad,
  type PdfQuad,
} from "@/lib/collection/pdf-geometry";

type Row = Record<string, unknown>;
const s=(value:unknown)=>String(value??"");

type PdfViewportLike={
  width:number;height:number;rotation:number;scale:number;
  convertToPdfPoint(x:number,y:number):[number,number];
  convertToViewportPoint(x:number,y:number):[number,number];
};
type PdfRenderTask={promise:Promise<void>;cancel?:()=>void};
type PdfPageLike={
  getViewport(options:{scale:number}):PdfViewportLike;
  render(options:{canvas:HTMLCanvasElement;viewport:PdfViewportLike;transform?:number[]}):PdfRenderTask;
  streamTextContent(options?:Record<string,unknown>):unknown;
};
type PdfDocumentLike={numPages:number;getPage(page:number):Promise<PdfPageLike>;destroy?:()=>Promise<void>};
type PdfLoadingTask={promise:Promise<PdfDocumentLike>;destroy?:()=>void};
type PdfJsLike={
  GlobalWorkerOptions:{workerSrc:string};
  getDocument(options:Record<string,unknown>):PdfLoadingTask;
  TextLayer:new(options:{container:HTMLDivElement;textContentSource:unknown;viewport:PdfViewportLike})=>{render():Promise<void>;cancel():void};
};

type FragmentDraft={
  page_number:number;
  page_width:number;
  page_height:number;
  page_rotation:number;
  quads:PdfQuad[];
  selected_text:string|null;
};
type SelectionDraft={text:string;fragments:FragmentDraft[];left:number;top:number};
type EditorDraft=SelectionDraft&{annotationType:"HIGHLIGHT"|"UNDERLINE"|"REGION";anchorKind:"TEXT"|"REGION";focusNote:boolean};

function annotationLabel(value:unknown){
  if(value==="HIGHLIGHT")return "Vurgulama";
  if(value==="UNDERLINE")return "Altını çizme";
  return "Bölge";
}

function PdfPage({
  pdf,pdfjs,pageNumber,scale,annotations,fragments,regionMode,onViewport,onRegion,onAnnotationClick,
}:{
  pdf:PdfDocumentLike;pdfjs:PdfJsLike;pageNumber:number;scale:number;annotations:Row[];fragments:Row[];regionMode:boolean;
  onViewport:(page:number,viewport:PdfViewportLike,base:PdfViewportLike)=>void;
  onRegion:(fragment:FragmentDraft,left:number,top:number)=>void;
  onAnnotationClick:(id:string)=>void;
}){
  const shellRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const textRef=useRef<HTMLDivElement>(null);
  const [pdfPage,setPdfPage]=useState<PdfPageLike|null>(null);
  const viewportRef=useRef<PdfViewportLike|null>(null);
  const baseViewportRef=useRef<PdfViewportLike|null>(null);
  const [near,setNear]=useState(pageNumber<=3);
  const [error,setError]=useState("");
  const [regionStart,setRegionStart]=useState<{x:number;y:number}|null>(null);
  const [regionBox,setRegionBox]=useState<{left:number;top:number;width:number;height:number}|null>(null);
  const displayViewport=useMemo(()=>pdfPage?pdfPage.getViewport({scale}):null,[pdfPage,scale]);
  const size=displayViewport?{width:displayViewport.width,height:displayViewport.height}:{width:612,height:792};

  useEffect(()=>{
    const node=shellRef.current;
    if(!node||typeof IntersectionObserver==="undefined"){setNear(true);return;}
    const observer=new IntersectionObserver(([entry])=>setNear(entry.isIntersecting),{rootMargin:"1200px 0px"});
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    if(!near)return;
    let cancelled=false;
    pdf.getPage(pageNumber).then((page)=>{
      if(cancelled)return;
      baseViewportRef.current=page.getViewport({scale:1});
      setPdfPage(page);
    }).catch(()=>!cancelled&&setError("PDF sayfası hazırlanamadı."));
    return()=>{cancelled=true;};
  },[pdf,pageNumber,near]);

  useEffect(()=>{
    if(!pdfPage||!displayViewport)return;
    const base=baseViewportRef.current??pdfPage.getViewport({scale:1});
    viewportRef.current=displayViewport;
    baseViewportRef.current=base;
    onViewport(pageNumber,displayViewport,base);
  },[pdfPage,displayViewport,pageNumber,onViewport]);

  useEffect(()=>{
    if(!near||!pdfPage||!displayViewport||!canvasRef.current||!textRef.current)return;
    const page=pdfPage,viewport=displayViewport,canvas=canvasRef.current,textLayer=textRef.current;
    const ratio=Math.max(1,window.devicePixelRatio||1);
    canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
    canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
    textLayer.replaceChildren();
    textLayer.style.width=`${viewport.width}px`;textLayer.style.height=`${viewport.height}px`;
    textLayer.style.setProperty("--total-scale-factor",String(viewport.scale));
    const renderTask=page.render({canvas,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
    const layer=new pdfjs.TextLayer({container:textLayer,textContentSource:page.streamTextContent({includeMarkedContent:true}),viewport});
    let stopped=false;
    Promise.all([renderTask.promise,layer.render()]).catch(()=>{if(!stopped)setError("PDF sayfası görüntülenemedi.");});
    return()=>{stopped=true;try{renderTask.cancel?.();}catch{}try{layer.cancel();}catch{}};
  },[near,pdfjs,pdfPage,displayViewport]);

  const annotationById=useMemo(()=>new Map(annotations.map(a=>[s(a.id),a])),[annotations]);
  const pageFragments=fragments.filter(f=>Number(f.page_number)===pageNumber);

  function pointerPoint(event:React.MouseEvent|React.PointerEvent){
    const box=shellRef.current?.getBoundingClientRect();
    if(!box)return null;
    return {x:event.clientX-box.left,y:event.clientY-box.top,box};
  }

  return <div className="citem-pdf-page-wrap">
    <div
      ref={shellRef}
      className="citem-pdf-page"
      data-pdf-page-number={pageNumber}
      style={{width:size.width,height:size.height}}
      onClick={(event)=>{
        if(regionMode||!viewportRef.current)return;
        const selection=window.getSelection();if(selection&&!selection.isCollapsed)return;
        const p=pointerPoint(event);if(!p)return;
        const [x,y]=viewportRef.current.convertToPdfPoint(p.x,p.y);
        for(const fragment of pageFragments){
          const quads=Array.isArray(fragment.quads)?fragment.quads as PdfQuad[]:[];
          if(quads.some(q=>pointInQuad({x,y},q))){onAnnotationClick(s(fragment.annotation_id));break;}
        }
      }}
    >
      {near?<canvas ref={canvasRef} className="citem-pdf-canvas" />:<div className="citem-pdf-placeholder">Sayfa {pageNumber}</div>}
      {near?<div ref={textRef} className="citem-pdf-text-layer" />:null}
      {near&&displayViewport?<svg className="citem-pdf-annotation-layer" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden>
        {pageFragments.flatMap((fragment)=>{
          const annotation=annotationById.get(s(fragment.annotation_id));if(!annotation)return[];
          const quads=Array.isArray(fragment.quads)?fragment.quads as PdfQuad[]:[];
          return quads.map((quad,index)=>{
            const points=pdfQuadToViewportPoints(quad,displayViewport!);
            const poly=points.map(p=>`${p.x},${p.y}`).join(" ");
            const key=`${s(fragment.id)}-${index}`;
            if(annotation.annotation_type==="UNDERLINE"){
              return <line key={key} x1={points[3].x} y1={points[3].y} x2={points[2].x} y2={points[2].y} className="citem-pdf-underline" />;
            }
            if(annotation.annotation_type==="REGION"){
              return <polygon key={key} points={poly} className="citem-pdf-region" />;
            }
            return <polygon key={key} points={poly} className="citem-pdf-highlight" />;
          });
        })}
      </svg>:null}
      {regionMode&&near?<div
        className="citem-pdf-region-capture"
        onPointerDown={(event)=>{
          const p=pointerPoint(event);if(!p)return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setRegionStart({x:p.x,y:p.y});setRegionBox({left:p.x,top:p.y,width:1,height:1});
        }}
        onPointerMove={(event)=>{
          if(!regionStart)return;const p=pointerPoint(event);if(!p)return;
          setRegionBox({left:Math.min(regionStart.x,p.x),top:Math.min(regionStart.y,p.y),width:Math.abs(p.x-regionStart.x),height:Math.abs(p.y-regionStart.y)});
        }}
        onPointerUp={(event)=>{
          if(!regionStart||!viewportRef.current||!baseViewportRef.current)return;
          const p=pointerPoint(event);if(!p)return;
          const left=Math.min(regionStart.x,p.x),top=Math.min(regionStart.y,p.y),right=Math.max(regionStart.x,p.x),bottom=Math.max(regionStart.y,p.y);
          setRegionStart(null);setRegionBox(null);
          if(right-left<5||bottom-top<5)return;
          const pageBox=shellRef.current!.getBoundingClientRect();
          const rect={left:pageBox.left+left,top:pageBox.top+top,right:pageBox.left+right,bottom:pageBox.top+bottom,width:right-left,height:bottom-top};
          const quad=clientRectToPdfQuad(rect,pageBox,viewportRef.current);
          onRegion({page_number:pageNumber,page_width:baseViewportRef.current.width,page_height:baseViewportRef.current.height,page_rotation:baseViewportRef.current.rotation,quads:[quad],selected_text:null},event.clientX,event.clientY);
        }}
      >{regionBox?<div className="citem-pdf-region-draft" style={regionBox}/>:null}</div>:null}
    </div>
    <div className="citem-pdf-page-number">Sayfa {pageNumber}</div>
    {error?<p className="mt-2 text-xs text-red-300">{error}</p>:null}
  </div>;
}

export function PdfSourceViewer({
  projectId,sourceId,assetId,signedUrl,annotations,fragments,gaps,requirements,defaultGapIds,defaultRequirementIds,focusedAnnotationId,onAnnotationSelect,
}:{
  projectId:string;sourceId:string;assetId:string;signedUrl:string;annotations:Row[];fragments:Row[];gaps:Row[];requirements:Row[];
  defaultGapIds:string[];defaultRequirementIds:string[];focusedAnnotationId?:string|null;
  onAnnotationSelect?:(annotationId:string)=>void;
}){
  const router=useRouter();
  const rootRef=useRef<HTMLDivElement>(null);
  const viewports=useRef(new Map<number,{viewport:PdfViewportLike;base:PdfViewportLike}>());
  const [pdfjs,setPdfjs]=useState<PdfJsLike|null>(null);
  const [pdf,setPdf]=useState<PdfDocumentLike|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [scale,setScale]=useState(1.2);
  const [regionMode,setRegionMode]=useState(false);
  const [selection,setSelection]=useState<SelectionDraft|null>(null);
  const [editor,setEditor]=useState<EditorDraft|null>(null);
  const [comment,setComment]=useState("");
  const [gapIds,setGapIds]=useState<string[]>(defaultGapIds);
  const [requirementIds,setRequirementIds]=useState<string[]>(defaultRequirementIds);
  const [message,setMessage]=useState("");
  const [saving,startSaving]=useTransition();

  useEffect(()=>{
    let cancelled=false;let task:PdfLoadingTask|null=null;let loadedPdf:PdfDocumentLike|null=null;
    (async()=>{
      try{
        setLoading(true);setError("");
        const pdfModule=(await import("pdfjs-dist/build/pdf.mjs")) as unknown as PdfJsLike;
        pdfModule.GlobalWorkerOptions.workerSrc="/vendor/pdfjs/pdf.worker.min.mjs";
        task=pdfModule.getDocument({url:signedUrl,cMapUrl:"/vendor/pdfjs/cmaps/",cMapPacked:true,standardFontDataUrl:"/vendor/pdfjs/standard_fonts/",isEvalSupported:false});
        loadedPdf=await task.promise;
        if(cancelled){await loadedPdf.destroy?.();return;}
        setPdfjs(pdfModule);setPdf(loadedPdf);
      }catch{if(!cancelled)setError("PDF CİTEM okuyucusunda açılamadı. Dosya bozuk veya şifreli olabilir.");}
      finally{if(!cancelled)setLoading(false);}
    })();
    return()=>{cancelled=true;try{task?.destroy?.();}catch{}void loadedPdf?.destroy?.();};
  },[signedUrl]);

  useEffect(()=>{
    if(!focusedAnnotationId||!rootRef.current)return;
    const first=fragments
      .filter(fragment=>s(fragment.annotation_id)===focusedAnnotationId)
      .sort((a,b)=>Number(a.page_number)-Number(b.page_number))[0];
    if(!first)return;
    const pageNumber=Number(first.page_number);
    const pageNode=rootRef.current.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`);
    if(!pageNode)return;
    pageNode.scrollIntoView({behavior:"smooth",block:"center"});
  },[focusedAnnotationId,fragments]);

  function captureSelection(){
    if(regionMode||!rootRef.current)return;
    const current=window.getSelection();
    if(!current||current.isCollapsed||!current.rangeCount)return;
    const text=current.toString().trim();if(!text)return;
    const range=current.getRangeAt(0);
    const ancestor=range.commonAncestorContainer instanceof Element?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
    if(!ancestor||!rootRef.current.contains(ancestor))return;
    const pageNodes=[...rootRef.current.querySelectorAll<HTMLElement>("[data-pdf-page-number]")];
    const grouped=new Map<number,DOMRect[]>();
    for(const rect of Array.from(range.getClientRects())){
      if(rect.width<.5||rect.height<.5)continue;
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const page=pageNodes.find(node=>{const b=node.getBoundingClientRect();return cx>=b.left&&cx<=b.right&&cy>=b.top&&cy<=b.bottom;});
      if(!page)continue;const n=Number(page.dataset.pdfPageNumber);
      grouped.set(n,[...(grouped.get(n)??[]),rect]);
    }
    if(!grouped.size||grouped.size>10){setMessage("Metin seçimi 1–10 PDF sayfası içinde olmalıdır.");return;}
    const draftFragments:FragmentDraft[]=[];
    for(const [pageNumber,rects] of [...grouped.entries()].sort((a,b)=>a[0]-b[0])){
      const node=rootRef.current.querySelector<HTMLElement>(`[data-pdf-page-number="${pageNumber}"]`);
      const view=viewports.current.get(pageNumber);if(!node||!view)continue;
      const pageRect=node.getBoundingClientRect();
      const clipped=mergeClientRects(rects.map(rect=>({
        left:Math.max(rect.left,pageRect.left),top:Math.max(rect.top,pageRect.top),right:Math.min(rect.right,pageRect.right),bottom:Math.min(rect.bottom,pageRect.bottom),
        width:Math.max(0,Math.min(rect.right,pageRect.right)-Math.max(rect.left,pageRect.left)),
        height:Math.max(0,Math.min(rect.bottom,pageRect.bottom)-Math.max(rect.top,pageRect.top)),
      })));
      const quads=clipped.map(rect=>clientRectToPdfQuad(rect,pageRect,view.viewport));
      if(quads.length)draftFragments.push({page_number:pageNumber,page_width:view.base.width,page_height:view.base.height,page_rotation:view.base.rotation,quads,selected_text:null});
    }
    if(!draftFragments.length)return;
    if(draftFragments.reduce((sum,f)=>sum+f.quads.length,0)>500){setMessage("Seçim çok büyük; daha küçük bir bölüm seçin.");return;}
    draftFragments[0].selected_text=text;
    const bounds=range.getBoundingClientRect();
    setSelection({text,fragments:draftFragments,left:Math.min(window.innerWidth-300,Math.max(12,bounds.left)),top:Math.min(window.innerHeight-70,Math.max(12,bounds.bottom+8))});
    setMessage("");
  }

  function openEditor(annotationType:"HIGHLIGHT"|"UNDERLINE",focusNote=false){
    if(!selection)return;
    setGapIds(defaultGapIds);setRequirementIds(defaultRequirementIds);setComment("");
    setEditor({...selection,annotationType,anchorKind:"TEXT",focusNote});setSelection(null);
  }

  function save(){
    if(!editor)return;
    startSaving(async()=>{
      const result=await createSourceAnnotationV2(projectId,{
        source_id:sourceId,asset_id:assetId,annotation_type:editor.annotationType,anchor_kind:editor.anchorKind,
        selected_text:editor.anchorKind==="TEXT"?editor.text:null,comment,fragments:editor.fragments,gap_ids:gapIds,requirement_ids:requirementIds,
      });
      if(result.error){setMessage(result.error);return;}
      setEditor(null);setComment("");window.getSelection()?.removeAllRanges();setMessage(result.success??"İşaretleme kaydedildi.");router.refresh();
    });
  }

  const toggle=(items:string[],id:string)=>items.includes(id)?items.filter(x=>x!==id):[...items,id];
  const handleViewport=useCallback((page:number,viewport:PdfViewportLike,base:PdfViewportLike)=>{
    viewports.current.set(page,{viewport,base});
  },[]);

  return <div ref={rootRef} className="citem-pdf-reader" onMouseUp={()=>requestAnimationFrame(captureSelection)}>
    <div className="citem-pdf-toolbar">
      <div className="flex items-center gap-2">
        <button type="button" className="citem-button-ghost" onClick={()=>setScale(v=>Math.max(.6,Number((v-.15).toFixed(2))))}>−</button>
        <span className="min-w-16 text-center text-xs text-stone-400">%{Math.round(scale*100)}</span>
        <button type="button" className="citem-button-ghost" onClick={()=>setScale(v=>Math.min(2.5,Number((v+.15).toFixed(2))))}>+</button>
        <button type="button" className="citem-button-ghost" onClick={()=>setScale(1.2)}>Varsayılan</button>
      </div>
      <button type="button" className={regionMode?"citem-button":"citem-button-ghost"} onClick={()=>{setRegionMode(v=>!v);setSelection(null);setEditor(null);window.getSelection()?.removeAllRanges();}}>
        {regionMode?"Bölge seçimi açık":"Bölge seç"}
      </button>
    </div>
    <p className="mb-3 text-xs text-stone-500">Metni fareyle seçin; vurgulama, altını çizme veya bağlı analist notu ekleyin. Görsel ve tablolar için Bölge seç aracını kullanın.</p>
    {loading?<div className="citem-pdf-state">PDF hazırlanıyor…</div>:null}
    {error?<div className="citem-pdf-state text-red-300">{error}</div>:null}
    {pdf&&pdfjs?<div className="citem-pdf-pages">
      {Array.from({length:pdf.numPages},(_,index)=><PdfPage
        key={index+1} pdf={pdf} pdfjs={pdfjs} pageNumber={index+1} scale={scale}
        annotations={annotations} fragments={fragments} regionMode={regionMode}
        onViewport={handleViewport}
        onRegion={(fragment,left,top)=>{
          setRegionMode(false);setGapIds(defaultGapIds);setRequirementIds(defaultRequirementIds);setComment("");
          setEditor({text:"",fragments:[fragment],left:Math.min(window.innerWidth-340,left+10),top:Math.min(window.innerHeight-420,top+10),annotationType:"REGION",anchorKind:"REGION",focusNote:true});
        }}
        onAnnotationClick={(id)=>{
          if(onAnnotationSelect){
            onAnnotationSelect(id);
            return;
          }
          document.querySelector<HTMLElement>(`[data-annotation-card="${id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
        }}
      />)}
    </div>:null}

    {selection?<div className="citem-pdf-selection-toolbar" style={{left:selection.left,top:selection.top}} onMouseDown={e=>e.preventDefault()} onMouseUp={e=>e.stopPropagation()}>
      <button type="button" onClick={()=>openEditor("HIGHLIGHT")}>Vurgula</button>
      <button type="button" onClick={()=>openEditor("UNDERLINE")}>Altını Çiz</button>
      <button type="button" onClick={()=>openEditor("HIGHLIGHT",true)}>Not Ekle</button>
    </div>:null}

    {editor?<div className="citem-pdf-annotation-editor" style={{left:Math.min(editor.left,window.innerWidth-380),top:Math.min(editor.top,window.innerHeight-520)}} onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm text-stone-100">{annotationLabel(editor.annotationType)}</strong>
        <button type="button" className="text-xs text-stone-500" onClick={()=>setEditor(null)}>Kapat</button>
      </div>
      {editor.text?<blockquote className="mt-3 max-h-24 overflow-auto border-l-2 border-amber-500 pl-3 text-xs text-stone-400">{editor.text}</blockquote>:null}
      <label className="mt-3 block text-xs text-stone-400">Analist Notu
        <textarea autoFocus={editor.focusNote} className="field mt-1 min-h-20" value={comment} onChange={e=>setComment(e.currentTarget.value)} maxLength={10000} placeholder="Bu işaret neden önemli? (isteğe bağlı)" />
      </label>
      <fieldset className="mt-3">
        <legend className="citem-label">Bilgi Açıkları</legend>
        <div className="mt-2 max-h-28 space-y-1 overflow-auto">{gaps.map(g=>{const id=s(g.id);return <label key={id} className="flex items-start gap-2 text-xs text-stone-400"><input type="checkbox" checked={gapIds.includes(id)} onChange={()=>setGapIds(v=>toggle(v,id))}/><span>{s(g.description)}</span></label>;})}</div>
      </fieldset>
      <fieldset className="mt-3">
        <legend className="citem-label">Toplama Gereksinimleri</legend>
        <div className="mt-2 max-h-28 space-y-1 overflow-auto">{requirements.map(r=>{const id=s(r.id);return <label key={id} className="flex items-start gap-2 text-xs text-stone-400"><input type="checkbox" checked={requirementIds.includes(id)} onChange={()=>setRequirementIds(v=>toggle(v,id))}/><span>{s(r.requirement)}</span></label>;})}</div>
      </fieldset>
      <div className="mt-4 flex gap-2"><button type="button" className="citem-button" disabled={saving} onClick={save}>{saving?"Kaydediliyor…":"Kaydet"}</button><button type="button" className="citem-button-ghost" onClick={()=>setEditor(null)}>İptal</button></div>
    </div>:null}
    {message?<p className="mt-3 text-xs text-amber-200">{message}</p>:null}
  </div>;
}
