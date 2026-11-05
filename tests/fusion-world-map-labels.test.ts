import {describe,it,expect} from "vitest";
import world from "@/lib/fusion/world-110m.json";
import countries from "@/lib/fusion/countries.json";
import {clampMapCenter,getWorldLabels,mapLabelFontSize,mapPixelsPerUnit,visibleMapLabels,type MapLabel,type WorldFeature} from "@/lib/fusion/world-map-labels";

const lookup=Object.fromEntries(countries.map(c=>[c.iso3,{code:c.iso2,name:c.name}]));
const labels=getWorldLabels(world.features as WorldFeature[],lookup);
describe("Fusion tactical map country labels",()=>{
 it("derives country positions from actual source polygons",()=>{
  const poland=labels.find(x=>x.code==="PL");
  const unitedStates=labels.find(x=>x.code==="US");
  expect(poland).toBeDefined();
  expect(unitedStates?.label).toBe("United States");
  expect(poland!.x).toBeGreaterThan(480);
  expect(poland!.x).toBeLessThan(550);
  expect(poland!.y).toBeGreaterThan(80);
  expect(poland!.area).toBeGreaterThan(0);
 });
 it("avoids intersecting label bounds and reveals extra countries as the user zooms in",()=>{
  const center:[number,number]=[480,240];
  const global=visibleMapLabels(labels,1,center,new Set());
  const zoomed=visibleMapLabels(labels,3,center,new Set());
  expect(global.length).toBeGreaterThan(15);
  expect(global.length).toBeLessThan(174);
  expect(global.some(x=>x.code==="US")).toBe(true);
  expect(zoomed.length).toBeGreaterThan(0);
  for(const [set,z] of [[global,1],[zoomed,3]] as const){
   for(let i=0;i<set.length;i++){
    for(let j=i+1;j<set.length;j++){
     const a=set[i],b=set[j];
     const aWidth=Math.max((a.label.length*7.1+11)/(2*z),13/z);
     const bWidth=Math.max((b.label.length*7.1+11)/(2*z),13/z);
     const overlapX=Math.abs(a.x-b.x)<aWidth+bWidth;
     const overlapY=Math.abs(a.y-b.y)<11/z;
     expect(overlapX&&overlapY).toBe(false);
    }
   }
  }
 });
 it("keeps measured uppercase labels apart on small and letterboxed screens at every zoom",()=>{
  // Deliberately wide measured names expose overlap if layout ignores real pixels.
  const widths=Object.fromEntries(labels.map(l=>[l.code,l.label.length*11]));
  for(const dimensions of [[360,520],[1440,700],[900,1000]] as [number,number][]){
   for(const zoom of [1,1.3,2.2,4,8]){
    const scale=mapPixelsPerUnit(dimensions,zoom);
    const shown=visibleMapLabels(labels,zoom,[530,160],new Set(),{pixelsPerUnit:scale,widths});
    for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++){
     const a=shown[i],b=shown[j];
     const overlapX=Math.abs(a.x-b.x)*scale<(widths[a.code]+widths[b.code]+20)/2;
     const overlapY=Math.abs(a.y-b.y)*scale<(mapLabelFontSize(a)+mapLabelFontSize(b)+16)/2;
     expect(overlapX&&overlapY).toBe(false);
    }
   }
  }
 });
 it("reveals small-country names with zoom and prioritizes a selected country in a dense region",()=>{
  const cluster:MapLabel[]=Array.from({length:5},(_,i)=>({code:`X${i}`,name:`Country ${i}`,label:`Country ${i}`,x:480+i*20,y:240,area:30}));
  const global=visibleMapLabels(cluster,1,[480,240],new Set());
  const detailed=visibleMapLabels(cluster,3,[480,240],new Set());
  expect(detailed.length).toBeGreaterThan(global.length);
  const selected=visibleMapLabels(cluster,3,[480,240],new Set(),{widths:Object.fromEntries(cluster.map(l=>[l.code,300])),selected:"X2"});
  expect(selected[0].code).toBe("X2");
 });
 it("uses the same meet scale for horizontal and vertical pan and keeps zoom-out inside the world",()=>{
  expect(mapPixelsPerUnit([960,960],2)).toBe(2);
  expect(mapPixelsPerUnit([480,960],2)).toBe(1);
  expect(clampMapCenter([-200,900],2)).toEqual([240,360]);
  expect(clampMapCenter([850,400],1)).toEqual([480,240]);
 });
});
