export type PdfPoint = { x: number; y: number };
export type PdfQuad = { x1:number;y1:number;x2:number;y2:number;x3:number;y3:number;x4:number;y4:number };
export type ClientRectLike = { left:number;top:number;right:number;bottom:number;width:number;height:number };
export type ViewportPointConverter = {
  convertToPdfPoint(x:number,y:number): [number,number];
  convertToViewportPoint(x:number,y:number): [number,number];
};

export function clientRectToPdfQuad(
  rect: ClientRectLike,
  pageRect: Pick<ClientRectLike, "left" | "top">,
  viewport: ViewportPointConverter,
): PdfQuad {
  const toPdf = (x:number,y:number) => viewport.convertToPdfPoint(x-pageRect.left,y-pageRect.top);
  const [x1,y1]=toPdf(rect.left,rect.top), [x2,y2]=toPdf(rect.right,rect.top);
  const [x3,y3]=toPdf(rect.right,rect.bottom), [x4,y4]=toPdf(rect.left,rect.bottom);
  if (![x1,y1,x2,y2,x3,y3,x4,y4].every(Number.isFinite)) throw new Error("PDF annotation geometry is not finite.");
  return {x1,y1,x2,y2,x3,y3,x4,y4};
}

export function pdfQuadToViewportPoints(quad:PdfQuad, viewport:ViewportPointConverter): PdfPoint[] {
  return [
    viewport.convertToViewportPoint(quad.x1,quad.y1),
    viewport.convertToViewportPoint(quad.x2,quad.y2),
    viewport.convertToViewportPoint(quad.x3,quad.y3),
    viewport.convertToViewportPoint(quad.x4,quad.y4),
  ].map(([x,y])=>({x,y}));
}

export function quadBounds(quad:PdfQuad) {
  const xs=[quad.x1,quad.x2,quad.x3,quad.x4], ys=[quad.y1,quad.y2,quad.y3,quad.y4];
  return {minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
}

export function pointInQuad(point:PdfPoint, quad:PdfQuad) {
  const v=[{x:quad.x1,y:quad.y1},{x:quad.x2,y:quad.y2},{x:quad.x3,y:quad.y3},{x:quad.x4,y:quad.y4}];
  let inside=false;
  for(let i=0,j=v.length-1;i<v.length;j=i++){
    const a=v[i],b=v[j];
    const hit=a.y>point.y!==b.y>point.y && point.x<((b.x-a.x)*(point.y-a.y))/(b.y-a.y||Number.EPSILON)+a.x;
    if(hit) inside=!inside;
  }
  return inside;
}

export function mergeClientRects(rects:ClientRectLike[], tolerance=3): ClientRectLike[] {
  const clean=rects.filter(r=>r.width>.5&&r.height>.5).sort((a,b)=>a.top-b.top||a.left-b.left);
  const merged:ClientRectLike[]=[];
  for(const rect of clean){
    const last=merged.at(-1);
    if(last&&Math.abs(last.top-rect.top)<=tolerance&&Math.abs(last.bottom-rect.bottom)<=tolerance&&rect.left-last.right<=tolerance*2){
      const left=Math.min(last.left,rect.left),top=Math.min(last.top,rect.top),right=Math.max(last.right,rect.right),bottom=Math.max(last.bottom,rect.bottom);
      merged[merged.length-1]={left,top,right,bottom,width:right-left,height:bottom-top};
    } else merged.push({...rect});
  }
  return merged;
}
