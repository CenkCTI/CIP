import {render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {FusionInventoryProcessing} from "@/components/fusion/fusion-inventory-processing";
import type {FusionInventoryItem} from "@/lib/fusion/types";

const changed=vi.fn();
vi.mock("@/components/investigations/source-reader/source-reader-workspace",()=>({
 SourceReaderWorkspace:({source,embedded,onChanged}:{source:{title:string};embedded:boolean;onChanged:()=>void})=>
  <section aria-label="Embedded Source Reader">
   <p>{source.title}</p>
   <span>{embedded?"Embedded Stage 3 Processing":"Navigation required"}</span>
   <button onClick={onChanged}>Refresh annotation state</button>
   <span>HIGHLIGHT · UNDERLINE · REGION · Process / Extract</span>
  </section>
}));
const item:FusionInventoryItem={
 project_id:"11111111-1111-4111-8111-111111111111",
 record_type:"SOURCE",record_id:"22222222-2222-4222-8222-222222222222",
 title:"Vendor incident report",summary:"Incident",preview_text:"Original content",
 source_id:"22222222-2222-4222-8222-222222222222",source_annotation_id:null,
 origin_kind:"SOURCE",processing_state:"UNPROCESSED",metadata:{},
 created_at:"2026-10-01",updated_at:"2026-10-02",
 annotation_ids:[],source_ids:[],gap_ids:[],requirement_ids:[],
 country_codes:[],assigned_source_ids:[],assigned_gap_ids:[],assigned_requirement_ids:[]
};
describe("Fusion Inventory Stage 3 reuses original processing reader",()=>{
 beforeEach(()=>changed.mockClear());
 afterEach(()=>vi.unstubAllGlobals());
 it("opens Source Reader inline and refetches Stage 3 data after a mutation",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({
   supported:true,reader:{source:{title:"Source PDF",id:item.record_id}}
  }),{status:200,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",fetcher);
  render(<FusionInventoryProcessing projectId={item.project_id} item={item} onChanged={changed}/>);
  expect(await screen.findByRole("region",{name:"Embedded Source Reader"})).toBeInTheDocument();
  expect(screen.getByText("Source PDF")).toBeInTheDocument();
  expect(screen.getByText("Embedded Stage 3 Processing")).toBeInTheDocument();
  screen.getByRole("button",{name:"Refresh annotation state"}).click();
  await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2));
  expect(String(fetcher.mock.calls[0]?.[0])).toContain("record="+item.record_id);
 });
 it("never invents a processable source for a record without Source provenance",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   supported:false,reason:"No Source linked to this Inventory record."
  }),{status:200,headers:{"Content-Type":"application/json"}})));
  render(<FusionInventoryProcessing projectId={item.project_id} item={{...item,record_type:"EVIDENCE"}} onChanged={changed}/>);
  expect(await screen.findByText("No Source linked to this Inventory record.")).toBeInTheDocument();
  expect(screen.queryByRole("region",{name:"Embedded Source Reader"})).not.toBeInTheDocument();
 });
 it("does not claim success or render a processor on an authorization failure",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   error:"Processing unavailable or access denied"
  }),{status:403,headers:{"Content-Type":"application/json"}})));
  render(<FusionInventoryProcessing projectId={item.project_id} item={item} onChanged={changed}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Processing unavailable or access denied");
  expect(screen.queryByRole("region",{name:"Embedded Source Reader"})).not.toBeInTheDocument();
 });
});
