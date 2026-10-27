import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {FusionInventory} from "@/components/fusion/fusion-inventory";
import type {FusionInventoryItem,FusionInventoryFilters} from "@/lib/fusion/types";

const refresh=vi.fn();
const add=vi.fn(async (_form:FormData)=>{});
const remove=vi.fn(async (_form:FormData)=>{});
const link=vi.fn(async (_form:FormData)=>{});
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("@/app/projects/[id]/fusion/actions",()=>({
 addFusionInventoryAssignment:(f:FormData)=>add(f),
 updateFusionInventoryAssignment:vi.fn(async()=>{}),
 removeFusionInventoryAssignment:(f:FormData)=>remove(f),
 linkCountryRecord:(f:FormData)=>link(f),
 editCountryRelationship:vi.fn(async()=>{}),
 unlinkCountryRecord:vi.fn(async()=>{}),
 setSourceReviewStatus:vi.fn(async()=>{})
}));
const source="11111111-1111-4111-8111-111111111111";
const manualId="22222222-2222-4222-8222-222222222222";
const record="33333333-3333-4333-8333-333333333333";
const item:FusionInventoryItem={
 project_id:"55555555-5555-4555-8555-555555555555",record_type:"EVIDENCE",record_id:record,
 title:"Research screenshot",summary:"Screenshot of activity",preview_text:"Observed data",
 created_at:"2026-01-01",updated_at:"2026-01-01",origin_kind:"EVIDENCE",source_id:null,
 source_annotation_id:null,processing_state:null,metadata:{},annotation_ids:[],source_ids:[],
 gap_ids:[],requirement_ids:[],country_codes:[],assigned_source_ids:[],
 assigned_gap_ids:[],assigned_requirement_ids:[]
};
const filters:FusionInventoryFilters={
 q:"",type:"",source:"",gap:"",requirement:"",country:"",state:"",group:"source",page:1,sort:"updated_at"
};
function fakeFetch(){
 let manual:{id:string;assignment_kind:string;assigned_id:string;rationale:string|null;created_at:string;updated_at:string}[]=[];
 vi.stubGlobal("fetch",vi.fn(async (url:string|URL)=>{
  const u=new URL(String(url),"http://localhost");
  if(u.searchParams.get("mode")==="lookup")return new Response(JSON.stringify({
   items:[{id:source,label:"Vendor report"}],total:1,page:1
  }),{status:200,headers:{"content-type":"application/json"}});
  return new Response(JSON.stringify({item,manual,countries:[],reviewStatus:null,labels:{[source]:"Vendor report"}}),
   {status:200,headers:{"content-type":"application/json"}});
 }));
 return {
  addAssignment:()=>{
   manual=[{id:manualId,assignment_kind:"SOURCE",assigned_id:source,rationale:"Analyst tag",
    created_at:"2026-01-01",updated_at:"2026-01-01"}];
  },
  clear:()=>{manual=[];}
 };
}
describe("Fusion Evidence Inventory inline record modal",()=>{
 beforeEach(()=>{add.mockReset();remove.mockReset();link.mockReset();refresh.mockReset();});
 afterEach(()=>{vi.unstubAllGlobals();});
 it("opens centered editable dialog, assigns an existing source without navigating, removes assignment",async()=>{
  const store=fakeFetch();add.mockImplementation(async(form:FormData)=>{
   expect(form.get("recordType")).toBe("EVIDENCE");
   expect(form.get("recordId")).toBe(record);
   expect(form.get("assignedId")).toBe(source);
   store.addAssignment();
  });remove.mockImplementation(async(form:FormData)=>{
   expect(form.get("assignmentId")).toBe(manualId);store.clear();
  });
  const user=userEvent.setup();
  render(<FusionInventory projectId={item.project_id} items={[item]} count={1} labels={{
   source:{},gap:{},requirement:{},country:{}
  }} filters={filters}/>);
  await user.click(screen.getByRole("button",{name:/Research screenshot/}));
  const modal=await screen.findByRole("dialog",{name:/Research screenshot/});
  expect(modal).toHaveAttribute("aria-modal","true");
  expect(within(modal).queryByText("Open original record")).not.toBeInTheDocument();
  expect(within(modal).getByText("No canonical association recorded")).toBeInTheDocument();
  const sourceSection=within(modal).getByText("Sources").closest("section")!;
  await user.click(within(sourceSection).getByRole("button",{name:"Search"}));
  await within(sourceSection).findByRole("option",{name:"Vendor report"});
  await user.selectOptions(within(sourceSection).getByRole("combobox",{name:"Choose Sources"}),source);
  await user.type(within(sourceSection).getByRole("textbox",{name:"Sources assignment rationale"}),"Analyst tag");
  await user.click(within(sourceSection).getByRole("button",{name:"Assign sources"}));
  await waitFor(()=>expect(add).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect(within(sourceSection).getByText("Analyst tag")).toBeInTheDocument());
  vi.stubGlobal("confirm",vi.fn(()=>true));
  await user.click(within(sourceSection).getByRole("button",{name:"Remove"}));
  await waitFor(()=>expect(remove).toHaveBeenCalledTimes(1));
  await user.click(within(modal).getByRole("button",{name:"Close inventory popup"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
 });
 it("renders existing manual country and provenance independently",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({
   item:{...item,source_ids:[source],assigned_source_ids:[]},
   manual:[],labels:{[source]:"Canonical vendor"},reviewStatus:null,
   countries:[{id:"aaaa",country_iso2:"PL",relation_type:"MENTIONED_IN_SOURCE",rationale:"Analyst relevance"}]
  }),{status:200,headers:{"content-type":"application/json"}})));
  const user=userEvent.setup();
  render(<FusionInventory projectId={item.project_id} items={[item]} count={1}
   labels={{source:{},gap:{},requirement:{},country:{}}} filters={filters}/>);
  await user.click(screen.getByRole("button",{name:/Research screenshot/}));
  const modal=await screen.findByRole("dialog");
  expect(await within(modal).findByText("Canonical vendor")).toBeInTheDocument();
  expect(within(modal).getByText(/Analyst relevance/)).toBeInTheDocument();
  await user.click(within(modal).getByRole("button",{name:"Evidence & provenance"}));
  expect(within(modal).getByText(/Original content/)).toBeInTheDocument();
 });
});
