export type WorldGeometry={
 type:string;
 coordinates:number[][][]|number[][][][];
};
export type WorldFeature={id:string;properties:{name:string};geometry:WorldGeometry};
export type MapLabel={code:string;name:string;x:number;y:number;area:number;label:string};

export const MAP_WIDTH=960;
export const MAP_HEIGHT=480;
export const MAP_LABEL_FONT='Georgia, "Times New Roman", serif';
export const MAP_LABEL_SPACING=1.1;
export const mapLabelFontSize=(label:MapLabel)=>label.area>1000?11:10;
export function mapPixelsPerUnit(dimensions:[number,number],zoom:number){
 return Math.max(.01,Math.min(dimensions[0]/MAP_WIDTH,dimensions[1]/MAP_HEIGHT)*zoom);
}
export function clampMapCenter(center:[number,number],zoom:number):[number,number]{
 const halfWidth=MAP_WIDTH/(2*zoom),halfHeight=MAP_HEIGHT/(2*zoom);
 return [Math.max(halfWidth,Math.min(MAP_WIDTH-halfWidth,center[0])),
  Math.max(halfHeight,Math.min(MAP_HEIGHT-halfHeight,center[1]))];
}
export function projectPoint(point:number[]):[number,number]{
 return [(point[0]+180)*MAP_WIDTH/360,(90-point[1])*MAP_HEIGHT/180];
}
function ringPath(ring:number[][]){
 let path="",previous:[number,number]|null=null;
 for(const p of ring){
  const xy=projectPoint(p);
  if(!Number.isFinite(xy[0])||!Number.isFinite(xy[1]))continue;
  const wrap=previous&&Math.abs(xy[0]-previous[0])>MAP_WIDTH/2;
  path+=(previous&&!wrap?"L":"M")+xy[0].toFixed(2)+","+xy[1].toFixed(2);
  previous=xy;
 }
 return path+"Z";
}
export function geometryPath(geometry:WorldGeometry){
 const polygons=(geometry.type==="Polygon"?[geometry.coordinates]:geometry.coordinates) as number[][][][];
 return polygons.map(poly=>poly.map(ringPath).join(" ")).join(" ");
}
function ringCenter(ring:number[][]){
 let doubled=0, cx=0,cy=0;
 for(let i=0;i<ring.length-1;i++){
  const a=projectPoint(ring[i]),b=projectPoint(ring[i+1]);
  const cross=a[0]*b[1]-b[0]*a[1];
  doubled+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;
 }
 if(Math.abs(doubled)<0.01)return null;
 return {x:cx/(3*doubled),y:cy/(3*doubled),area:Math.abs(doubled)/2};
}
const abbreviations:Record<string,string>={
 "United States of America":"United States","Democratic Republic of the Congo":"DR Congo",
 "Central African Republic":"Central African Rep.","United Republic of Tanzania":"Tanzania",
 "United Kingdom":"United Kingdom","Republic of the Congo":"Congo",
 "Bosnia and Herzegovina":"Bosnia & Herz.","Papua New Guinea":"Papua New Guinea"
};
const shortCountryNames:Record<string,string>={
 US:"United States",RU:"Russia",GB:"United Kingdom",TR:"Türkiye",IR:"Iran",
 KP:"North Korea",KR:"South Korea",VN:"Vietnam",LA:"Laos",TZ:"Tanzania",
 BO:"Bolivia",VE:"Venezuela",CD:"DR Congo",CG:"Congo",CZ:"Czechia",
 MD:"Moldova",SY:"Syria",BN:"Brunei",FM:"Micronesia",PS:"Palestine",
 MK:"North Macedonia",CI:"Côte d'Ivoire",TL:"Timor-Leste",TW:"Taiwan"
};
export function getWorldLabels(features:WorldFeature[],countryNames:Record<string,{code:string;name:string}>):MapLabel[]{
 const result:MapLabel[]=[];
 for(const feature of features){
  const country=countryNames[feature.id];
  if(!country)continue;
  const polygons=(feature.geometry.type==="Polygon"?[feature.geometry.coordinates]:feature.geometry.coordinates) as number[][][][];
  let largest:{x:number;y:number;area:number}|null=null;
  for(const polygon of polygons){
   const candidate=ringCenter(polygon[0]);
   if(candidate&&(!largest||candidate.area>largest.area))largest=candidate;
  }
  if(!largest||largest.x<0||largest.x>MAP_WIDTH||largest.y<0||largest.y>MAP_HEIGHT)continue;
  result.push({code:country.code,name:country.name,label:shortCountryNames[country.code]??abbreviations[feature.properties.name]??country.name,...largest});
 }
 return result;
}
const referenceFeatured=new Set([
 "US","CA","MX","BR","AR","RU","CN","IN","AU","ZA","TR","DE","FR","UA","PL",
 "IT","GB","ES","EG","SA","IR","DZ","LY","SD","NE","JP","ID","NG"
]);
type LabelLayout={pixelsPerUnit?:number;widths?:Record<string,number>;selected?:string};
export function visibleMapLabels(labels:MapLabel[],zoom:number,center:[number,number],linked:ReadonlySet<string>,layout:LabelLayout={}){
 const width=MAP_WIDTH/zoom,height=MAP_HEIGHT/zoom;
 const left=center[0]-width/2,top=center[1]-height/2;
 // Match the uppercase serif text, tracking and halo in screen pixels. The SVG
 // uses `meet`, so the scale includes both viewport dimensions, not just zoom.
 // Browser-measured widths replace the conservative server-render estimate.
 const scale=layout.pixelsPerUnit??zoom;
 const taken:{left:number;right:number;top:number;bottom:number}[]=[];
 const priority=(l:MapLabel)=>l.code===layout.selected?3:linked.has(l.code)?2:referenceFeatured.has(l.code)?1:0;
 const candidates=labels
  .filter(l=>l.code!=="AQ"||linked.has(l.code)||l.code===layout.selected)
  .filter(l=>l.x>left&&l.x<left+width&&l.y>top&&l.y<top+height)
  .filter(l=>zoom>=2.2||referenceFeatured.has(l.code)||l.area>=Math.max(20,300/(zoom*zoom))||linked.has(l.code)||l.code===layout.selected)
  .sort((a,b)=>priority(b)-priority(a)||b.area-a.area||a.code.localeCompare(b.code));
 const placed:MapLabel[]=[];
 for(const label of candidates){
  const effectiveWidth=(layout.widths?.[label.code]??label.label.length*8)+10;
  const radius=effectiveWidth/(2*scale),halfHeight=(mapLabelFontSize(label)+8)/(2*scale);
  const bounds={left:label.x-radius,right:label.x+radius,top:label.y-halfHeight,bottom:label.y+halfHeight};
  // Do not show half labels at the clipped viewport edge while panning.
  if(bounds.left<left||bounds.right>left+width||bounds.top<top||bounds.bottom>top+height)continue;
  if(taken.some(b=>!(bounds.right<b.left||bounds.left>b.right||bounds.bottom<b.top||bounds.top>b.bottom)))continue;
  taken.push(bounds);placed.push(label);
 }
 return placed;
}
