import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {ProcessingCopilot} from "@/components/investigations/source-reader/ai/processing-copilot";

vi.mock("@/components/ai/byok-connection-panel",()=>({
  ByokConnectionPanel:()=> <div>BYOK settings</div>,
}));
const projectId="49429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429615-bc04-4539-ae53-69f0b47157cb";
const assetId="49429715-bc04-4539-ae53-69f0b47157cb";
const props={projectId,sourceId,assetId,sourceTitle:"Storm-0558 PDF",
  selectedAnnotationId:null,activePage:3,pageCount:34,
  onClose:vi.fn(),onNavigate:vi.fn()};
const answer={summary:"The objective may be collection and prepositioning.",
  hypotheses:[{title:"Information collection",rationale:"Reconnaissance evidence",
    confidence:"MEDIUM",supportingEvidence:[],counterEvidence:[],tests:[]}],
  evidence:[],webEvidence:[],discarded:0,unansweredQuestions:[],warnings:[]};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

function mockApi(calls:{url:string;body?:Record<string,unknown>}[]){
  vi.stubGlobal("fetch",vi.fn(async(url:string,options?:RequestInit)=>{
    const body=options?.body?JSON.parse(String(options.body)) as Record<string,unknown>:undefined;
    calls.push({url,body});
    if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
      connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b"})};
    if(url.includes("/memory")&&(!options?.method||options.method==="GET"))
      return {ok:true,json:async()=>({notes:"Prior claims provisional.",
        turns:[{id:"one",question:"What happened?",created_at:"2026-10-22T19:00:00Z",
          context:{context:{kind:"page",page:2}},result:{...answer,summary:"Previously saved response"}}]})};
    if(url.endsWith("/research/plan"))return {ok:true,json:async()=>({
      queries:["APT28 strategic goals Polish government", "CERT Polska APT28 campaign assessment"]})};
    if(url.endsWith("/research/search"))return {ok:true,json:async()=>({
      results:[
        {title:"CERT report",url:"https://cert.pl/report",domain:"cert.pl",snippet:"APT28 campaign",
          publisher:"cert.pl",publishedAt:null,query:"APT28"},
        {title:"NATO notice",url:"https://nato.int/notice",domain:"nato.int",snippet:"Government targeting",
          publisher:"nato.int",publishedAt:null,query:"APT28"},
      ]})};
    if(url.endsWith("/analyst-chat"))return {ok:true,json:async()=>({saved:true,result:answer})};
    throw Error("Unexpected fetch "+url);
  }));
}

describe("Compact Copilot preferences and in-chat Web Research",()=>{
  it("loads memory enabled by default, and opens BYOK/memory only from top settings",async()=>{
    const calls:{url:string;body?:Record<string,unknown>}[]=[];
    mockApi(calls);
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("Previously saved response");
    expect(screen.queryByText("BYOK settings")).toBeNull();
    expect(screen.queryByTestId("copilot-research-dock")).toBeNull();
    expect(screen.queryByTestId("copilot-settings-popover")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Copilot settings"}));
    expect(screen.getByRole("region",{name:"Copilot preferences"})).toBeTruthy();
    expect((screen.getByLabelText(/Analyst chat · persistent investigation memory/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Include selected PDF evidence/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Enable Web Research mode/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/NVIDIA BYOK/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Close settings"}));
    expect(screen.queryByTestId("copilot-settings-popover")).toBeNull();
    const textarea=screen.getByPlaceholderText("Ask a question about the selected source…");
    fireEvent.change(textarea,{target:{value:"Why might APT28 target ministries?"}});
    fireEvent.click(screen.getByRole("button",{name:"Ask analyst"}));
    await screen.findByTestId("copilot-hypotheses");
    const sent=calls.find(x=>x.url.endsWith("/analyst-chat"));
    expect(sent?.body).toMatchObject({webResearch:false,useSource:true,
      context:{kind:"page",page:3},question:"Why might APT28 target ministries?"});
    expect(sent?.body).not.toHaveProperty("notes");
    expect(sent?.body).not.toHaveProperty("pdfText");
  });
  it("plans searches inside chat, waits for explicit approval, and shows results and assessment inline",async()=>{
    const calls:{url:string;body?:Record<string,unknown>}[]=[];
    mockApi(calls);
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("Previously saved response");
    fireEvent.click(screen.getByRole("button",{name:"Web research"}));
    fireEvent.change(screen.getByPlaceholderText("Ask a research question…"),
      {target:{value:"What are APT28 strategic objectives?"}});
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("copilot-inline-search-suggestions");
    expect(calls.filter(c=>c.url.endsWith("/research/search"))).toHaveLength(0);
    const plan=calls.find(x=>x.url.endsWith("/research/plan"));
    expect(plan?.body?.context).toEqual({kind:"page",page:3});
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByTestId("copilot-inline-search-results");
    expect(calls.find(x=>x.url.endsWith("/research/search"))?.body?.queries)
      .toEqual(["APT28 strategic goals Polish government","CERT Polska APT28 campaign assessment"]);
    fireEvent.click(screen.getByRole("button",{name:"Read & analyse selected (2)"}));
    await screen.findByTestId("copilot-inline-research-analysis");
    expect(calls.find(x=>x.url.endsWith("/analyst-chat"))?.body).toMatchObject({
      webResearch:true,selectedUrls:["https://cert.pl/report","https://nato.int/notice"],
      question:"What are APT28 strategic objectives?"});
    expect(screen.getByText("CERT report ↗")).toBeTruthy();
    expect(screen.getByText("NATO notice ↗")).toBeTruthy();
  });
});
