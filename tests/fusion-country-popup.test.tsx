import {render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {FusionWorldMap} from "@/components/fusion/fusion-world-map";

const refresh=vi.fn(),createCountryNote=vi.fn(async(_form:FormData)=>{}),updateCountryNote=vi.fn(async(_form:FormData)=>{});
vi.mock("next/navigation",()=>({useRouter:()=>({refresh}),usePathname:()=>"/projects/test/fusion"}));
vi.mock("@/app/projects/[id]/fusion/actions",()=>({
 createCountryNote:(form:FormData)=>createCountryNote(form),
 updateCountryNote:(form:FormData)=>updateCountryNote(form),
 deleteCountryNote:vi.fn(async()=>{}),linkCountryRecord:vi.fn(async()=>{}),
 unlinkCountryRecord:vi.fn(async()=>{}),editCountryRelationship:vi.fn(async()=>{}),
 attachExistingEvidence:vi.fn(async()=>{}),detachExistingEvidence:vi.fn(async()=>{})
}));
vi.mock("@/components/workspace-forms",()=>({
 EvidenceUpload:()=> <p>Authorized Evidence pipeline</p>,
 EvidenceDownload:()=> <button>Private download</button>
}));
const result=(country:string,note="")=>({
 country,counts:{links:0,notes:note?1:0,attachments:0},sourceCount:0,links:[],linksTotal:0,
 typeCounts:[],overviewRecords:[],cyber:[
  {key:"incidents",total:0,items:[]},{key:"actors",total:0,items:[]},
  {key:"campaigns",total:0,items:[]},{key:"technical",total:0,items:[]}
 ],
 notes:note?[{id:"cccccccc-1111-4111-8111-111111111111",title:"Country Brief",body:note,
 created_at:"2026-10-27T00:00:00Z",updated_at:"2026-10-27T00:00:00Z",created_by:"aaaaaaaa-1111-4111-8111-111111111111"}]:[],
 notesTotal:note?1:0,brief:note?{id:"cccccccc-1111-4111-8111-111111111111",title:"Country Brief",body:note,created_by:"aaaaaaaa-1111-4111-8111-111111111111",created_at:"2026-10-27T00:00:00Z",updated_at:"2026-10-27T00:00:00Z"}:null,
 attachments:[],filesTotal:0,details:{},evidence:[],pages:{links:1,notes:1,files:1},limit:20
});
function stubFetch(){
 let note="";
 vi.stubGlobal("fetch",vi.fn(async(req:string|URL)=>{
  const u=new URL(String(req),"http://localhost");
  return new Response(JSON.stringify(u.searchParams.get("mode")==="lookup"?{items:[],total:0,limit:20,page:1}:result(u.searchParams.get("country")||"PL",note)),{status:200,headers:{"content-type":"application/json"}});
 }));
 return (s:string)=>{note=s;};
}
describe("Country Intelligence Popup map integration",()=>{
 beforeEach(()=>{window.history.replaceState(null,"","/projects/test/fusion?view=map");refresh.mockReset();createCountryNote.mockClear();updateCountryNote.mockClear();});
 afterEach(()=>vi.unstubAllGlobals());
 it("opens via country search, shows four tabs, closes without recreating map zoom and handles browser history",async()=>{
  stubFetch();const user=userEvent.setup();
  render(<FusionWorldMap projectId="test" selectedCountry="" counts={{}}/>);
  const zoom=screen.getByRole("button",{name:"Zoom in"});await user.click(zoom);
  expect(screen.getByText(/130%/)).toBeInTheDocument();
  await user.type(screen.getByLabelText("Find a country or territory"),"Poland");
  await user.click(within(screen.getByLabelText("Country search results")).getByRole("button",{name:/Poland/}));
  const dialog=await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Poland · PL \/ POL/)).toBeInTheDocument();
  for(const t of ["Overview","Linked Records","Notes & Files","Cyber Activity"]){
   expect(within(dialog).getByRole("tab",{name:t})).toBeInTheDocument();
  }
  expect(window.location.search).toContain("country=PL");
  await user.click(within(dialog).getByRole("button",{name:"Close country intelligence popup"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText(/130%/)).toBeInTheDocument();
  expect(window.location.search).not.toContain("country=PL");
  window.history.pushState(null,"","/projects/test/fusion?view=map&country=PL");
  window.dispatchEvent(new PopStateEvent("popstate"));
  await screen.findByRole("dialog");
 });
 it("switches from Poland to Ukraine without leaving map, loads country-specific content",async()=>{
  stubFetch();const user=userEvent.setup();
  render(<FusionWorldMap projectId="test" selectedCountry="PL" counts={{}}/>);
  let dialog=await screen.findByRole("dialog");
  await user.selectOptions(within(dialog).getByLabelText("Switch country"),"UA");
  dialog=await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Ukraine · UA \/ UKR/)).toBeInTheDocument();
  expect(window.location.search).toContain("country=UA");
 });
 it("saves analyst-authored brief using original country note action and keeps popup open",async()=>{
  const setNote=stubFetch();const user=userEvent.setup();
  createCountryNote.mockImplementation(async (form:FormData)=>{
   expect(form.get("country")).toBe("PL");expect(form.get("title")).toBe("Country Brief");
   setNote(String(form.get("body")));
  });
  render(<FusionWorldMap projectId="test" selectedCountry="PL" counts={{}}/>);
  const dialog=await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button",{name:"Edit brief"}));
  await user.type(within(dialog).getByLabelText("Country brief"),"Analyst observation only");
  await user.click(within(dialog).getByRole("button",{name:"Save brief"}));
  await waitFor(()=>expect(within(dialog).getByText("Analyst observation only")).toBeInTheDocument());
  expect(createCountryNote).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
 });
 it("does not discard unsaved analyst brief when moving to another tab without confirmation",async()=>{
  stubFetch();const user=userEvent.setup();
  const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
  render(<FusionWorldMap projectId="test" selectedCountry="PL" counts={{}}/>);
  const dialog=await screen.findByRole("dialog");
  await user.click(await within(dialog).findByRole("button",{name:"Edit brief"}));
  await user.type(within(dialog).getByLabelText("Country brief"),"Unpublished investigation note");
  await user.click(within(dialog).getByRole("tab",{name:"Linked Records"}));
  expect(confirm).toHaveBeenCalled();
  expect(within(dialog).getByLabelText("Country brief")).toHaveValue("Unpublished investigation note");
  expect(within(dialog).getByRole("tab",{name:"Overview"})).toHaveAttribute("aria-selected","true");
  confirm.mockReturnValue(true);
  await user.click(within(dialog).getByRole("tab",{name:"Linked Records"}));
  expect(within(dialog).getByRole("tab",{name:"Linked Records"})).toHaveAttribute("aria-selected","true");
 });

 it("guards against discarding a newly typed country note when collapsing its editor",async()=>{
  stubFetch();const user=userEvent.setup();
  const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);
  render(<FusionWorldMap projectId="test" selectedCountry="PL" counts={{}}/>);
  const dialog=await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("tab",{name:"Notes & Files"}));
  await user.click(within(dialog).getByRole("button",{name:"+ New note"}));
  await user.type(within(dialog).getByLabelText("Note title"),"Unsaved research");
  await user.click(within(dialog).getByRole("button",{name:"+ New note"}));
  expect(confirm).toHaveBeenCalledOnce();
  expect(within(dialog).getByLabelText("Note title")).toHaveValue("Unsaved research");
 });

 it("opens Country Intelligence Brief by clicking a country polygon directly, without search",async()=>{
  stubFetch();const user=userEvent.setup();
  render(<FusionWorldMap projectId="test" selectedCountry="" counts={{}}/>);
  const map=screen.getByRole("img",{name:"Interactive map of the world with selectable country boundaries and labels"});
  const polygon=within(map).getByRole("button",{name:/Poland: 0 linked materials/});
  await user.click(polygon);
  const dialog=await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Poland · PL \/ POL/)).toBeInTheDocument();
  expect(window.location.search).toContain("country=PL");
 });
 it("renders readable names on the map while preserving polygon accessibility",()=>{
  stubFetch();
  render(<FusionWorldMap projectId="test" selectedCountry="" counts={{}}/>);
  const label=screen.getByText("United States");
  expect(label).toBeInTheDocument();
  expect(label).toHaveClass("fusion-map-country-name");
  expect(screen.getByRole("button",{name:/United States of America: 0 linked materials/})).toBeInTheDocument();
 });

});
