import { describe,it,expect } from "vitest";
import {groupInventory,inventoryDetailUrl,type FusionInventoryItem} from "@/lib/fusion/types";
const item=(id:string,sources:string[]):FusionInventoryItem=>({
 project_id:"p",record_type:"SOURCE_CLAIM",record_id:id,title:"Proposition",summary:"",preview_text:"",
 created_at:"2026-01-01",updated_at:"2026-01-01",origin_kind:"SOURCE_REPORTED",
 source_id:null,source_annotation_id:null,processing_state:null,metadata:{},
 annotation_ids:[],source_ids:sources,gap_ids:[],requirement_ids:[],country_codes:[],
 assigned_source_ids:[],assigned_gap_ids:[],assigned_requirement_ids:[]
});
describe("Fusion canonical inventory",()=>{
 it("does not multiply unique records when the same claim has multiple sources",()=>{
  const i=item("1",["s1","s2"]);const groups=groupInventory([i],"source");
  expect(groups).toHaveLength(2);
  expect(groups.map(x=>x.items[0].record_id)).toEqual(["1","1"]);
  expect(new Set(groups.flatMap(g=>g.items.map(i=>i.record_id))).size).toBe(1);
 });
 it("groups manual links while keeping canonical provenance intact",()=>{
  const record={...item("manual",[]),assigned_source_ids:["s3"],assigned_gap_ids:["gap-1"],
   assigned_requirement_ids:["req-1"]};
  expect(record.source_ids).toEqual([]);
  expect(groupInventory([record],"source")[0].key).toBe("source:s3");
  expect(groupInventory([record],"gap")[0].key).toBe("gap:gap-1");
  expect(groupInventory([record],"requirement")[0].key).toBe("requirement:req-1");
 });
 it("keeps independent records visible",()=>{
  expect(groupInventory([item("2",[])],"source")[0].key).toBe("unlinked");
 });
 it("preserves canonical Country Note membership in the map popup deep link",()=>{
  const countryId="20000000-0000-4000-8000-000000000001";
  const i={...item("note",[]),record_type:"COUNTRY_NOTE",metadata:{countryId}};
  expect(inventoryDetailUrl("project-1",i)).toBe(
   `/projects/project-1/fusion?view=map&countryId=${countryId}`);
 });
 it("uses annotation identity in its reader deep link",()=>{
  const i={...item("a",["s1"]),record_type:"ANNOTATION"};
  expect(inventoryDetailUrl("p",i)).toBe("/projects/p/sources/s1?annotation=a");
 });
});
