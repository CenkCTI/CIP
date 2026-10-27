import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";

const requireOwnedProject=vi.fn();
const loadFusionSourceReader=vi.fn();
vi.mock("@/lib/projects/ownership",()=>({requireOwnedProject}));
vi.mock("@/lib/fusion/source-reader-data",()=>({loadFusionSourceReader}));
const project="11111111-1111-4111-8111-111111111111";
const record="22222222-2222-4222-8222-222222222222";
const source="33333333-3333-4333-8333-333333333333";
const path="http://localhost/api/projects/"+project+"/fusion/processing";
function database(item:Record<string,unknown>){
 const calls:{table:string;filters:[string,unknown][]}[]=[];
 const db={
  from:(table:string)=>{
   const filters:[string,unknown][]=[];
   calls.push({table,filters});
   const q={
    select:(_cols:string)=>q,
    eq:(key:string,val:unknown)=>{filters.push([key,val]);return q;},
    limit:(_size:number)=>Promise.resolve({data:[],error:null}),
    maybeSingle:async()=>({data:table==="fusion_inventory_items"?item:table==="sources"?{id:source}:null,error:null})
   };
   return q;
  }
 };
 return {db,calls};
}
describe("Fusion Processing Source resolution",()=>{
 beforeEach(()=>{vi.clearAllMocks();});
 it("loads only an owned, canonical source for an inventory annotation",async()=>{
  const {db,calls}=database({record_type:"ANNOTATION",record_id:record,source_ids:[source],source_annotation_id:record,assigned_source_ids:[]});
  requireOwnedProject.mockResolvedValue({supabase:db});
  loadFusionSourceReader.mockResolvedValue({source:{id:source,title:"Report"}});
  const {GET}=await import("@/app/api/projects/[id]/fusion/processing/route");
  const response=await GET(new NextRequest(path+"?type=ANNOTATION&record="+record+"&sourceId=00000000-0000-4000-8000-000000000001"),{params:Promise.resolve({id:project})});
  expect(response.status).toBe(200);
  expect((await response.json()).supported).toBe(true);
  expect(loadFusionSourceReader).toHaveBeenCalledWith(project,source,record);
  expect(calls[0].filters).toEqual(expect.arrayContaining([["project_id",project],["record_type","ANNOTATION"],["record_id",record]]));
  expect(calls[1].filters).toEqual(expect.arrayContaining([["project_id",project],["id",source]]));
 });
 it("rejects missing authorization before checking any Source",async()=>{
  requireOwnedProject.mockRejectedValue(new Error("Access denied"));
  const {GET}=await import("@/app/api/projects/[id]/fusion/processing/route");
  const response=await GET(new NextRequest(path+"?type=SOURCE&record="+record),{params:Promise.resolve({id:project})});
  expect(response.status).toBe(403);
  expect(loadFusionSourceReader).not.toHaveBeenCalled();
 });
 it("does not fabricate annotations for an unlinked Evidence record",async()=>{
  const {db}=database({record_type:"EVIDENCE",record_id:record,source_ids:[],assigned_source_ids:[]});
  requireOwnedProject.mockResolvedValue({supabase:db});
  const {GET}=await import("@/app/api/projects/[id]/fusion/processing/route");
  const response=await GET(new NextRequest(path+"?type=EVIDENCE&record="+record),{params:Promise.resolve({id:project})});
  expect(response.status).toBe(200);
  expect((await response.json()).supported).toBe(false);
  expect(loadFusionSourceReader).not.toHaveBeenCalled();
 });
});
