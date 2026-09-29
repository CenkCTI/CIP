import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { quadBounds, type PdfQuad } from "@/lib/collection/pdf-geometry";

type Row=Record<string,unknown>;
const s=(value:unknown)=>String(value??"");

export function orderAnnotations(annotations:Row[],fragments:Row[]){
  const first=new Map<string,Row>();
  for(const fragment of fragments){
    const id=s(fragment.annotation_id);
    const current=first.get(id);
    if(!current||Number(fragment.page_number)<Number(current.page_number))first.set(id,fragment);
  }
  return [...annotations].sort((a,b)=>{
    const af=first.get(s(a.id)),bf=first.get(s(b.id));
    const ap=Number(af?.page_number??a.page_number??Number.MAX_SAFE_INTEGER),bp=Number(bf?.page_number??b.page_number??Number.MAX_SAFE_INTEGER);
    if(ap!==bp)return ap-bp;
    const aq=Array.isArray(af?.quads)?(af!.quads as PdfQuad[])[0]:null;
    const bq=Array.isArray(bf?.quads)?(bf!.quads as PdfQuad[])[0]:null;
    const ay=aq?quadBounds(aq).maxY:-Infinity,by=bq?quadBounds(bq).maxY:-Infinity;
    if(ay!==by)return by-ay;
    return s(a.created_at).localeCompare(s(b.created_at));
  });
}

export async function burnAnnotationsIntoPdf(original:Uint8Array,annotations:Row[],fragments:Row[]){
  const doc=await PDFDocument.load(original);
  const font=await doc.embedFont(StandardFonts.HelveticaBold);
  const ordered=orderAnnotations(annotations,fragments);
  const numberById=new Map(ordered.map((a,index)=>[s(a.id),index+1]));
  const annotationById=new Map(annotations.map(a=>[s(a.id),a]));
  const firstFragmentSeen=new Set<string>();

  for(const fragment of fragments){
    const annotation=annotationById.get(s(fragment.annotation_id));
    if(!annotation||Number(annotation.geometry_version)!==2)continue;
    const pageNumber=Number(fragment.page_number);
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>doc.getPageCount())continue;
    const page=doc.getPage(pageNumber-1);
    const quads=Array.isArray(fragment.quads)?fragment.quads as PdfQuad[]:[];
    for(const quad of quads){
      const b=quadBounds(quad);
      if(annotation.annotation_type==="HIGHLIGHT"){
        page.drawRectangle({x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY,color:rgb(0.96,0.67,0.18),opacity:0.24,borderOpacity:0});
      }else if(annotation.annotation_type==="UNDERLINE"){
        page.drawLine({start:{x:quad.x4,y:quad.y4},end:{x:quad.x3,y:quad.y3},thickness:1.5,color:rgb(0.79,0.48,0.12),opacity:.95});
      }else if(annotation.annotation_type==="REGION"){
        page.drawRectangle({x:b.minX,y:b.minY,width:b.maxX-b.minX,height:b.maxY-b.minY,borderColor:rgb(0.79,0.48,0.12),borderWidth:1.5,borderOpacity:.95,opacity:0});
      }
    }
    const id=s(annotation.id);
    if(annotation.comment&&!firstFragmentSeen.has(id)&&quads.length){
      firstFragmentSeen.add(id);const b=quadBounds(quads[0]);const n=numberById.get(id)??0;
      const x=Math.min(page.getWidth()-18,b.maxX+3),y=Math.min(page.getHeight()-14,b.maxY);
      page.drawCircle({x:x+6,y:y+4,size:6,color:rgb(0.79,0.48,0.12),opacity:.95});
      page.drawText(String(n),{x:x+3.3,y:y+.7,size:6.5,font,color:rgb(1,1,1)});
    }
  }
  return new Uint8Array(await doc.save());
}

export async function mergePdfBytes(frontMatter:Uint8Array,source:Uint8Array){
  const output=await PDFDocument.create();
  const front=await PDFDocument.load(frontMatter),body=await PDFDocument.load(source);
  const frontPages=await output.copyPages(front,front.getPageIndices());
  frontPages.forEach(page=>output.addPage(page));
  const bodyPages=await output.copyPages(body,body.getPageIndices());
  bodyPages.forEach(page=>output.addPage(page));
  return new Uint8Array(await output.save());
}
