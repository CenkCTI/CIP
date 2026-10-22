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
const MAX_RENDER_PIXELS=8_000_000;
const MAX_ARTWORK_REGIONS=2500;

/** Only actual bitmap, mask, and shading operations are fully immutable.
 * Broad vector bounding boxes often include white paths behind hyperlinked
 * text and entire tables of contents, so preserving those rectangles wholesale
 * leaves visible white stripes. Instead, graphics drawn as vector paths are
 * contrast-treated pixelwise by recolorPdfPagePixels.
 *
 * Bounding boxes from PDF.js 5.4.x are normalized canvas fractions. Source
 * page pixels and PDF annotation geometry are never written to storage.
 */
export function pdfArtworkRegions(
  fnArray:readonly number[]|undefined,
  ops:Record<string,number>|undefined,
  boxes:PdfOperationBounds|undefined|null,
  rgba:Uint8ClampedArray,
  width:number,height:number,
):PdfArtworkRegion[]|null{
  if(!fnArray||!ops||!fnArray.length||typeof ops.paintImageXObject!=="number")return null;
  if(width<=0||height<=0||width*height>MAX_RENDER_PIXELS||rgba.length!==width*height*4)return null;
  const images=new Set<number>(IMAGE_OPERATORS.map(x=>ops[x]).filter((v):v is number=>typeof v==="number"));
  // No image operators: text-only or vector-only pages are safe even when
  // PDF.js does not provide recorded operation boxes.
  if(!fnArray.some(id=>images.has(id)))return [];
  if(!boxes||fnArray.length!==boxes.length)return null;
  const result:PdfArtworkRegion[]=[];
  for(let i=0;i<fnArray.length;i++){
    if(!images.has(fnArray[i]))continue;
    // Empty image paint extents are not inspectable; keep the original page.
    if(boxes.isEmpty(i))return null;
    const fractions=[boxes.minX(i),boxes.minY(i),boxes.maxX(i),boxes.maxY(i)];
    if(!fractions.every(Number.isFinite)||fractions.some(value=>value<0||value>1.004))return null;
    const [l,t,r,b]=[
      fractions[0]*width,fractions[1]*height,
      fractions[2]*width,fractions[3]*height,
    ];
    const rect={
      left:Math.max(0,Math.floor(l)-2),top:Math.max(0,Math.floor(t)-2),
      right:Math.min(width,Math.ceil(r)+2),bottom:Math.min(height,Math.ceil(b)+2),
    };
    if(rect.right<=rect.left||rect.bottom<=rect.top)return null;
    result.push(rect);
    if(result.length>MAX_ARTWORK_REGIONS)return null;
  }
  return result;
}

/** Apply a legible dark reader presentation, with three distinct surfaces:
 * - raster/shading pixels: immutable, original RGB and alpha
 * - native PDF text rectangles: force single-luminance conversion to prevent
 *   cyan/orange glyph fringes and make blue hyperlinks readable
 * - remaining vector/neutral page pixels: convert neutral backgrounds/lines,
 *   but preserve source-colored chart strokes outside textual rectangles
 *
 * Fully scanned pages remain Original rather than modifying their images.
 */
export function recolorPdfPagePixels(
  rgba:Uint8ClampedArray,width:number,height:number,
  mode:PdfReadingMode,regions:readonly PdfArtworkRegion[],
  textRects:readonly PdfArtworkRegion[]=[],
):boolean{
  if(mode==="original")return true;
  if(width<=0||height<=0||width*height>MAX_RENDER_PIXELS||rgba.length!==width*height*4)return false;
  const mask=new Uint8Array(width*height);
  for(const rect of regions){
    for(let y=rect.top;y<rect.bottom;y++){
      mask.fill(1,y*width+rect.left,y*width+rect.right);
    }
  }
  let preserved=0;
  for(let i=0;i<mask.length;i++)preserved+=mask[i];
  if(preserved>=mask.length*.96)return false;

  const textMask=new Uint8Array(width*height);
  for(const rect of textRects){
    const left=Math.max(0,Math.floor(rect.left)),top=Math.max(0,Math.floor(rect.top));
    const right=Math.min(width,Math.ceil(rect.right)),bottom=Math.min(height,Math.ceil(rect.bottom));
    for(let y=top;y<bottom;y++)textMask.fill(1,y*width+left,y*width+right);
  }

  const parse=(hex:string)=>[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16));
  const foreground=parse(PDF_READING_COLORS[mode].foreground);
  const background=parse(PDF_READING_COLORS[mode].background);
  for(let p=0,k=0;p<mask.length;p++,k+=4){
    if(mask[p])continue;
    const r=rgba[k],g=rgba[k+1],b=rgba[k+2];
    const high=Math.max(r,g,b),low=Math.min(r,g,b);
    const luminance=(r*.2126+g*.7152+b*.0722)/255;
    // Graphic pixels, such as colored vector chart bars, keep their source
    // RGB. Text regions are deliberately exempt from this protection.
    if(!textMask[p] && high-low>42 && high>95)continue;
    for(let c=0;c<3;c++){
      rgba[k+c]=Math.round(foreground[c]*(1-luminance)+background[c]*luminance);
    }
  }
  return true;
}
