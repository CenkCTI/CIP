import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import {
  PDF_READING_COLORS,PDF_READING_MODE_OPTIONS,PDF_READING_MODE_STORAGE_KEY,
  parsePdfReadingMode,pdfArtworkRegions,recolorPdfPagePixels,
  type PdfOperationBounds,
} from "../src/components/investigations/source-reader/pdf/pdf-reading-mode";

function recordedBox(
  coords:Array<[number,number,number,number]|null>,
  width=20,height=20,
):PdfOperationBounds{
  // Our synthetic inputs use image-space pixels; PDF.js BBoxReader returns
  // normalized fractions, never absolute pixel values.
  return {
    length:coords.length,
    isEmpty:(i)=>coords[i]===null,
    minX:(i)=>coords[i]![0]/width,
    minY:(i)=>coords[i]![1]/height,
    maxX:(i)=>coords[i]![2]/width,
    maxY:(i)=>coords[i]![3]/height,
  };
}
const ops={fill:1,showText:2,paintImageXObject:3,stroke:4};

describe("CİTEM PDF mixed-content reading appearance",()=>{
  it("supports precisely three appearances and defaults to Original",()=>{
    expect(PDF_READING_MODE_OPTIONS.map(x=>x.label)).toEqual(["Orijinal","Koyu Yeşil","Gece Siyahı"]);
    expect(parsePdfReadingMode("forest")).toBe("forest");
    expect(parsePdfReadingMode("night")).toBe("night");
    expect(parsePdfReadingMode(null)).toBe("original");
    expect(parsePdfReadingMode("invalid")).toBe("original");
    expect(PDF_READING_MODE_STORAGE_KEY).toContain("citem:pdf-reading-mode:v1");
    expect(PDF_READING_COLORS.forest.background).toBe("#182b25");
    expect(PDF_READING_COLORS.night.background).toBe("#151719");
  });
  it("recolors neutral page background and black text, preserving heatmap image RGB exactly",()=>{
    const width=10,height=10;
    const original=new Uint8ClampedArray(width*height*4);
    for(let p=0;p<original.length;p+=4){
      original[p]=255;original[p+1]=255;original[p+2]=255;original[p+3]=255;
    }
    // Black letters outside image region.
    let k=(8*width+1)*4;
    original[k]=0;original[k+1]=0;original[k+2]=0;
    // Illustrated image at x=4..6,y=2..4, including light-colored cells.
    for(let y=2;y<5;y++)for(let x=4;x<7;x++){
      k=(y*width+x)*4;
      original[k]=245;original[k+1]=176;original[k+2]=163;
    }
    const imageBefore=original.slice((2*width+4)*4,(2*width+7)*4);
    const boxes=recordedBox([null,[4,2,7,5],null],width,height);
    const regions=pdfArtworkRegions([2,3,2],ops,boxes,original,width,height);
    expect(regions).not.toBeNull();
    expect(recolorPdfPagePixels(original,width,height,"night",regions!)).toBe(true);
    const sample=(x:number,y:number)=>[...original.slice((y*width+x)*4,(y*width+x)*4+3)];
    expect(sample(0,0)).toEqual([21,23,25]);
    expect(sample(1,8)).toEqual([227,230,232]);
    expect([...original.slice((2*width+4)*4,(2*width+7)*4)]).toEqual([...imageBefore]);
    expect(sample(4,3)).toEqual([245,176,163]);
  });
  it("eliminates chromatic LCD antialiasing fringes around dark-mode text",()=>{
    const width=5,height=2;
    const data=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<data.length;i+=4){
      data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255;
    }
    const put=(x:number,y:number,r:number,g:number,b:number)=>{
      const i=(y*width+x)*4;
      data[i]=r;data[i+1]=g;data[i+2]=b;
    };
    // These blue and orange tones are representative of PDF glyph subpixel
    // fringes in the reported browser screenshot, NOT authored colored art.
    put(1,0,245,198,136);
    put(2,0,112,185,249);
    put(3,0,181,214,235);
    put(0,1,0,0,0);
    // Actual colored figures/heatmaps must remain untouched within their bounds.
    put(4,1,250,110,45);
    const imageBefore=[...data.slice((width+4)*4,(width+5)*4)];
    expect(recolorPdfPagePixels(data,width,height,"forest",[
      {left:4,top:1,right:5,bottom:2},
    ],[{left:0,top:0,right:4,bottom:2}])).toBe(true);
    const color=(x:number,y:number)=>[...data.slice((y*width+x)*4,(y*width+x)*4+3)];
    for(const x of [1,2,3]){
      const rgb=color(x,0);
      // Foreground/background are both near neutral, regardless of any
      // aggressively colored source antialiasing pixel.
      expect(Math.max(...rgb)-Math.min(...rgb)).toBeLessThan(20);
      expect(rgb).not.toEqual([[245,198,136],[112,185,249],[181,214,235]][x-1]);
    }
    expect(color(0,1)).toEqual([230,238,233]);
    expect(color(0,0)).toEqual([24,43,37]);
    expect([...data.slice((width+4)*4,(width+5)*4)]).toEqual(imageBefore);
  });

  it("darkens a white vector-backed hyperlink without altering colorful vector graphics",()=>{
    const width=8,height=5,data=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<data.length;i+=4){
      data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=255;
    }
    const set=(x:number,y:number,r:number,g:number,b:number)=>{
      const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;
    };
    // Pale hyperlink box with dark blue ink should not stay white or dark blue.
    set(2,2,20,55,175);
    // Red vector chart bar is outside text bounds and must retain its RGB.
    set(6,3,245,64,46);
    expect(recolorPdfPagePixels(data,width,height,"forest",[],
      [{left:1,top:1,right:4,bottom:4}])).toBe(true);
    const rgb=(x:number,y:number)=>[...data.slice((y*width+x)*4,(y*width+x)*4+3)];
    expect(rgb(0,0)).toEqual([24,43,37]);
    expect(rgb(3,2)).toEqual([24,43,37]);
    expect(rgb(2,2)).not.toEqual([20,55,175]);
    expect(rgb(6,3)).toEqual([245,64,46]);
  });

  it("protects vector charts and scanned pages, and never guesses a mismatched operator list",()=>{
    const data=new Uint8ClampedArray(20*20*4).fill(255);
    const vectorRegions=pdfArtworkRegions([2,4],ops,
      recordedBox([null,[3,3,12,8]]),data,20,20);
    // Vector shapes must not preserve wide white rectangles surrounding URLs.
    expect(vectorRegions).toEqual([]);
    expect(pdfArtworkRegions([2,4],ops,null,data,20,20)).toEqual([]);
    expect(pdfArtworkRegions([3,2],ops,recordedBox([null]),data,20,20)).toBeNull();
    expect(pdfArtworkRegions([3],ops,null,data,20,20)).toBeNull();
    expect(pdfArtworkRegions([3],{},recordedBox([[0,0,20,20]]),data,20,20)).toBeNull();
    const wholePage=pdfArtworkRegions([3],ops,recordedBox([[0,0,20,20]]),data,20,20);
    expect(wholePage).toHaveLength(1);
    expect(recolorPdfPagePixels(data,20,20,"forest",wholePage!)).toBe(false);
  });
  it("does not protect a plain white PDF vector page background",()=>{
    const data=new Uint8ClampedArray(20*20*4).fill(255);
    const regions=pdfArtworkRegions([1,2],ops,recordedBox([[0,0,20,20],null]),data,20,20);
    expect(regions).toEqual([]);
    expect(recolorPdfPagePixels(data,20,20,"forest",regions!)).toBe(true);
    expect([...data.slice(0,3)]).toEqual([24,43,37]);
  });
  it("keeps original source, selected text, annotation geometry and AI evidence focus unmodified",()=>{
    const viewer=readFileSync("src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx","utf8");
    expect(viewer).toContain("recordOperations:canProcess");
    expect(viewer).toContain("pdfArtworkRegions(operations.fnArray,pdfjs.OPS,page.recordedBBoxes");
    expect(viewer).toContain("recolorPdfPagePixels(original.data,canvas.width,canvas.height,readingMode,regions,textBounds)");
    expect(viewer).toContain("window.localStorage.setItem(PDF_READING_MODE_STORAGE_KEY,value)");
    expect(viewer).toContain("clientRectToPdfQuad");
    expect(viewer).toContain("locatePdfEvidence");
    expect(viewer).toContain("onAnnotationCreated?.({");
    expect(viewer).not.toContain("filter:invert(");
  });
});
