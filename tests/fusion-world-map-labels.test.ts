import {describe,it,expect} from "vitest";
import world from "@/lib/fusion/world-110m.json";
import countries from "@/lib/fusion/countries.json";
import {getWorldLabels,visibleMapLabels,type WorldFeature} from "@/lib/fusion/world-map-labels";

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
     const aWidth=Math.max((a.label.length*5.6+7)/(2*z),13/z);
     const bWidth=Math.max((b.label.length*5.6+7)/(2*z),13/z);
     const overlapX=Math.abs(a.x-b.x)<aWidth+bWidth;
     const overlapY=Math.abs(a.y-b.y)<11/z;
     expect(overlapX&&overlapY).toBe(false);
    }
   }
  }
 });
});
