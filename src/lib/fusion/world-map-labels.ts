export type WorldGeometry={
 type:string;
 coordinates:number[][][]|number[][][][];
};
export type WorldFeature={id:string;properties:{name:string};geometry:WorldGeometry};
export type MapLabel={code:string;name:string;x:number;y:number;area:number;label:string};

export const MAP_WIDTH=960;
export const MAP_HEIGHT=480;
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
  result.push({code:country.code,name:country.name,label:abbreviations[feature.properties.name]??country.name,...largest});
 }
 return result;
}
export function visibleMapLabels(labels:MapLabel[],zoom:number,center:[number,number],linked:ReadonlySet<string>){
 const width=MAP_WIDTH/zoom,height=MAP_HEIGHT/zoom;
 const left=center[0]-width/2,top=center[1]-height/2;
 // Label collision is computed in world coordinates but uses fixed on-screen text
 // dimensions, so zooming in reveals smaller countries without label overlap.
 const cellWidth=13/zoom,cellHeight=11/zoom;
 const taken:{left:number;right:number;top:number;bottom:number}[]=[];
 const candidates=labels
  .filter(l=>l.x>left&&l.x<left+width&&l.y>top&&l.y<top+height)
  .filter(l=>zoom>=2.2||l.area>=Math.max(60,190/(zoom*zoom))||linked.has(l.code))
  .sort((a,b)=>(linked.has(b.code)?1:0)-(linked.has(a.code)?1:0)||b.area-a.area);
 const placed:MapLabel[]=[];
 for(const label of candidates){
  const effectiveWidth=(label.label.length*5.6+7)/zoom;
  const radius=Math.max(effectiveWidth/2,cellWidth);
  const bounds={left:label.x-radius,right:label.x+radius,top:label.y-cellHeight/2,bottom:label.y+cellHeight/2};
  if(taken.some(b=>!(bounds.right<b.left||bounds.left>b.right||bounds.bottom<b.top||bounds.top>b.bottom)))continue;
  taken.push(bounds);placed.push(label);
 }
 return placed;
}
