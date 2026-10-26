import { describe,it,expect } from "vitest";
import {groupInventory,inventoryDetailUrl,type FusionInventoryItem} from "@/lib/fusion/types";
const item=(id:string,sources:string[]):FusionInventoryItem=>({
 project_id:"p",record_type:"SOURCE_CLAIM",record_id:id,title:"Proposition",summary:"",preview_text:"",
 created_at:"2026-01-01",updated_at:"2026-01-01",origin_kind:"SOURCE_REPORTED",
 source_id:null,source_annotation_id:null,processing_state:null,metadata:{},
 annotation_ids:[],source_ids:sources,gap_ids:[],requirement_ids:[],country_codes:[]
});
describe("Fusion canonical inventory",()=>{
 it("does not multiply unique records when the same claim has multiple sources",()=>{
  const i=item("1",["s1","s2"]);const groups=groupInventory([i],"source");
  expect(groups).toHaveLength(2);
  expect(groups.map(x=>x.items[0].record_id)).toEqual(["1","1"]);
  expect(new Set(groups.flatMap(g=>g.items.map(i=>i.record_id))).size).toBe(1);
 });
 it("keeps independent records visible",()=>{
  expect(groupInventory([item("2",[])],"source")[0].key).toBe("unlinked");
 });
 it("uses annotation identity in its reader deep link",()=>{
  const i={...item("a",["s1"]),record_type:"ANNOTATION"};
  expect(inventoryDetailUrl("p",i)).toBe("/projects/p/sources/s1?annotation=a");
 });
});
