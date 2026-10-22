/**
 * CİTEM PDF reader's client-side, display-only appearance transformation.
 * Keep the PDF.js source bitmap intact at every image/vector artwork location,
 * then recolor neutral white backgrounds / black text outside those regions.
 * No CSS inversion; source PDFs, text layers and annotation coordinates remain
 * unchanged. Unknown or uninspectable graphics fail closed to Original mode.
 */
export type PdfReadingMode = "original" | "forest" | "night";

export const PDF_READING_MODE_STORAGE_KEY = "citem:pdf-reading-mode:v1";
export const PDF_READING_MODE_OPTIONS: ReadonlyArray<{value:PdfReadingMode;label:string}> = [
  {value:"original",label:"Orijinal"},
  {value:"forest",label:"Koyu Yeşil"},
  {value:"night",label:"Gece Siyahı"},
];
export const PDF_READING_COLORS:Record<PdfReadingMode,{background:string;foreground:string}> = {
  original:{background:"#ffffff",foreground:"#000000"},
  forest:{background:"#182b25",foreground:"#e6eee9"},
  night:{background:"#151719",foreground:"#e3e6e8"},
};
export function parsePdfReadingMode(value:unknown):PdfReadingMode {
  return value==="forest"||value==="night"?value:"original";
}

export type PdfArtworkRegion={left:number;top:number;right:number;bottom:number};
export type PdfOperationBounds={
  length:number;
  isEmpty(index:number):boolean;
  minX(index:number):number;minY(index:number):number;
  maxX(index:number):number;maxY(index:number):number;
};

const IMAGE_OPERATORS=[
  "paintImageXObject","paintImageXObjectRepeat",
  "paintInlineImageXObject","paintInlineImageXObjectGroup",
  "paintImageMaskXObject","paintImageMaskXObjectRepeat",
  "paintImageMaskXObjectGroup","paintSolidColorImageMask",
  "paintImageXObjectGroup","paintJpegXObject",
  "shadingFill",
] as const;
const VECTOR_OPERATORS=[
  "stroke","closeStroke","fill","eoFill","fillStroke",
  "eoFillStroke","closeFillStroke","closeEOFillStroke",
  "paintFormXObjectBegin","paintFormXObjectEnd",
] as const;
const MAX_RENDER_PIXELS=8_000_000;
const MAX_ARTWORK_REGIONS=2500;

/** Detect an explicit full-page white vector fill (paper backdrop). Such a
 * fill must not prevent the remaining actual text from being recolored.
 * All image/shading operations remain protected even when page-sized.
 */
function mostlyWhiteSamples(
  rgba:Uint8ClampedArray,width:number,height:number,rect:PdfArtworkRegion,
):boolean{
  let white=0,seen=0;
  for(let sy=1;sy<=4;sy++)for(let sx=1;sx<=4;sx++){
    const x=Math.min(width-1,Math.max(0,Math.floor(rect.left+(rect.right-rect.left)*sx/5)));
    const y=Math.min(height-1,Math.max(0,Math.floor(rect.top+(rect.bottom-rect.top)*sy/5)));
    const offset=(y*width+x)*4;
    const r=rgba[offset],g=rgba[offset+1],b=rgba[offset+2];
    if(r>235&&g>235&&b>235)white++;
    seen++;
  }
  return white>=Math.ceil(seen*.9);
}

/** Returns null if original colors must be preserved for the whole page.
 * For PDF.js 5.4.x, recordedBBoxes is from render({recordOperations:true})
 * and coordinates are *canvas device pixels*, aligned with the operator list.
 * Verify operator-list length rather than guessing when alignment is unknown.
 */
export function pdfArtworkRegions(
  fnArray:readonly number[]|undefined,
  ops:Record<string,number>|undefined,
  boxes:PdfOperationBounds|undefined|null,
  rgba:Uint8ClampedArray,
  width:number,height:number,
):PdfArtworkRegion[]|null{
  if(!fnArray||!ops||!boxes||!fnArray.length||fnArray.length!==boxes.length)return null;
  if(typeof ops.paintImageXObject!=="number"||typeof ops.fill!=="number")return null;
  if(width<=0||height<=0||width*height>MAX_RENDER_PIXELS||rgba.length!==width*height*4)return null;
  const images=new Set<number>(IMAGE_OPERATORS.map(x=>ops[x]).filter((v):v is number=>typeof v==="number"));
  const vectors=new Set<number>(VECTOR_OPERATORS.map(x=>ops[x]).filter((v):v is number=>typeof v==="number"));
  const result:PdfArtworkRegion[]=[];
  for(let i=0;i<fnArray.length;i++){
    const operation=fnArray[i];
    if(!images.has(operation)&&!vectors.has(operation))continue;
    if(boxes.isEmpty(i))continue;
    const l=boxes.minX(i),t=boxes.minY(i),r=boxes.maxX(i),b=boxes.maxY(i);
    if(![l,t,r,b].every(Number.isFinite))return null;
    const rect={
      left:Math.max(0,Math.floor(l)-2),top:Math.max(0,Math.floor(t)-2),
      right:Math.min(width,Math.ceil(r)+2),bottom:Math.min(height,Math.ceil(b)+2),
    };
    if(rect.right<=rect.left||rect.bottom<=rect.top)continue;
    const area=(rect.right-rect.left)*(rect.bottom-rect.top);
    // A large, plain white path is commonly the PDF's background layer.
    if(!images.has(operation)&&area>=width*height*.85&&mostlyWhiteSamples(rgba,width,height,rect))continue;
    result.push(rect);
    if(result.length>MAX_ARTWORK_REGIONS)return null;
  }
  return result;
}

/** Change neutral pixels only. Vector and raster image rectangles remain
 * byte-for-byte unchanged. Unknown full-page scans remain Original.
 * Returns false when the page cannot be recolored safely.
 */
export function recolorPdfPagePixels(
  rgba:Uint8ClampedArray,width:number,height:number,
  mode:PdfReadingMode,regions:readonly PdfArtworkRegion[],
):boolean{
  if(mode==="original")return true;
  if(width<=0||height<=0||width*height>MAX_RENDER_PIXELS||rgba.length!==width*height*4)return false;
  const mask=new Uint8Array(width*height);
  for(const rect of regions){
    for(let y=rect.top;y<rect.bottom;y++){
      mask.fill(1,y*width+rect.left,y*width+rect.right);
    }
  }
  // A full-page image/scan must remain unchanged; do not pretend dark mode is applied.
  let preserved=0;
  for(let i=0;i<mask.length;i++)preserved+=mask[i];
  if(preserved>=mask.length*.96)return false;

  const parse=(hex:string)=>[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16));
  const foreground=parse(PDF_READING_COLORS[mode].foreground);
  const background=parse(PDF_READING_COLORS[mode].background);
  for(let p=0,k=0;p<mask.length;p++,k+=4){
    if(mask[p])continue;
    const r=rgba[k],g=rgba[k+1],b=rgba[k+2];
    // Leave source-defined colored marks and diagrams untouched.
    if(Math.max(r,g,b)-Math.min(r,g,b)>25)continue;
    const tone=(r+g+b)/765;
    for(let c=0;c<3;c++){
      rgba[k+c]=Math.round(foreground[c]*(1-tone)+background[c]*tone);
    }
  }
  return true;
}
