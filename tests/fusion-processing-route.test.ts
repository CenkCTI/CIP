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
    in:(key:string,values:unknown[])=>{filters.push([key,values]);return q;},
    order:(_col:string,_args?:unknown)=>q,
    limit:(_size:number)=>Promise.resolve({data:table==="sources"?
      (Array.isArray(item.source_ids)&&item.source_ids.length?
       (item.source_ids as string[]).map(id=>({id,title:"Source "+id.slice(0,8)})):[]):
      [],error:null}),
    maybeSingle:async()=>({data:table==="fusion_inventory_items"?item:null,error:null})
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
  expect(calls[1].filters).toEqual(expect.arrayContaining([["project_id",project],["id",[source]]]));
 });
 it("requires the analyst to choose when more than one owned Source is related",async()=>{
  const second="44444444-4444-4444-8444-444444444444";
  const {db}=database({record_type:"EVIDENCE",record_id:record,source_ids:[source,second],assigned_source_ids:[]});
  requireOwnedProject.mockResolvedValue({supabase:db});
  const {GET}=await import("@/app/api/projects/[id]/fusion/processing/route");
  const ambiguous=await GET(new NextRequest(path+"?type=EVIDENCE&record="+record),{params:Promise.resolve({id:project})});
  expect(ambiguous.status).toBe(200);
  expect(await ambiguous.json()).toMatchObject({supported:false,choices:[{id:source},{id:second}]});
  const unauthorized=await GET(new NextRequest(path+"?type=EVIDENCE&record="+record+"&source=55555555-5555-4555-8555-555555555555"),{params:Promise.resolve({id:project})});
  expect(unauthorized.status).toBe(403);
  expect(loadFusionSourceReader).not.toHaveBeenCalled();
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
