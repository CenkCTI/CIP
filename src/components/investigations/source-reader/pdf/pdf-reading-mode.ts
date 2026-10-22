/**
 * PDF appearance is purely presentational; the immutable PDF is not changed.
 * PDF.js pageColors also recolors artwork, so never use it on pages that may
 * contain images or vector drawings. Unknown operator lists fail closed.
 */
export type PdfReadingMode = "original" | "forest" | "night";
export const PDF_READING_MODE_STORAGE_KEY = "citem:pdf-reading-mode:v1";

export const PDF_READING_MODE_OPTIONS: ReadonlyArray<{ value:PdfReadingMode; label:string }> = [
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

export function pdfRenderPageColors(mode:PdfReadingMode){
  return mode==="original"?undefined:PDF_READING_COLORS[mode];
}

const VISUAL_PAINT_OPERATORS=[
  "constructPath", "stroke", "closeStroke", "fill", "eoFill",
  "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke",
  "shadingFill", "paintImageXObject", "paintImageXObjectRepeat",
  "paintInlineImageXObject", "paintInlineImageXObjectGroup",
  "paintImageMaskXObject", "paintImageMaskXObjectRepeat",
  "paintImageMaskXObjectGroup", "paintSolidColorImageMask",
  "paintFormXObjectBegin", "paintFormXObjectEnd",
  "paintImageXObjectGroup", "paintJpegXObject",
] as const;

/** PDF.js operator IDs, not hard-coded numbers. Conservative visual protection. */
export function containsProtectedPdfArtwork(
  fnArray:readonly number[]|undefined,
  ops:Record<string,number>|undefined,
):boolean {
  if(!fnArray||!ops||fnArray.length===0)return true;
  if(typeof ops.constructPath!=="number"||typeof ops.paintImageXObject!=="number")return true;
  const protectedOps=new Set<number>(
    VISUAL_PAINT_OPERATORS.map(name=>ops[name]).filter((v):v is number=>typeof v==="number"),
  );
  return fnArray.some(id=>protectedOps.has(id));
}
