import {render,screen,fireEvent} from "@testing-library/react";
import {describe,it,expect,beforeEach,vi} from "vitest";
import {ControlledWebResearch} from "@/components/investigations/source-reader/ai/controlled-web-research";
import {ProcessingCopilot} from "@/components/investigations/source-reader/ai/processing-copilot";
vi.mock("@/components/ai/byok-connection-panel",()=>({
  ByokConnectionPanel:()=> <div data-testid="byok-panel">BYOK settings</div>,
}));

const props={projectId:"49429515-bc04-4539-ae53-69f0b47157cb",
  sourceId:"49429615-bc04-4539-ae53-69f0b47157cb",
  assetId:"49429715-bc04-4539-ae53-69f0b47157cb",
  context:{kind:"page" as const,page:6},connected:true};
const sample={title:"Outside report",url:"https://example.org/report",domain:"example.org",
  snippet:"Threat group studied",publisher:"example.org",publishedAt:null,
  query:"APT28 router compromise"};
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();fetchMock.mockReset();vi.stubGlobal("fetch",fetchMock);});

describe("AI Phase 5 panel discoverability",()=>{
  it("docks a visible research toggle outside the scrollable chat transcript",()=>{
    fetchMock.mockImplementation(async(url:string)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",
        model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      throw Error("Unexpected "+url);
    });
    render(<ProcessingCopilot {...props} sourceTitle="Test source" selectedAnnotationId={null}
      activePage={6} pageCount={20} onClose={vi.fn()} onNavigate={vi.fn()}/>);
    const dock=screen.getByTestId("copilot-research-dock");
    const history=screen.getByLabelText("Copilot chat history");
    const toggle=screen.getByRole("button",{name:/Controlled Web Research/});
    expect(dock.contains(toggle)).toBe(true);
    expect(history.contains(dock)).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Research question")).toBeTruthy();
  });
});
describe("AI Phase 5 deliberate web search UI",()=>{
  it("plans first, searches only after approval, and only pre-fills Stage 2",async()=>{
    const called:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      called.push(url);
      if(url.endsWith("/plan")){
        const body=JSON.parse(String(options?.body));
        expect(body.context).toEqual({kind:"page",page:6});
        expect(body).not.toHaveProperty("sourceText");
        return {ok:true,json:async()=>({queries:["APT28 router compromise","APT28 CERT-UA 2023"]})};
      }
      if(url.endsWith("/search"))return {ok:true,json:async()=>({results:[sample]})};
      throw Error("Unexpected call "+url);
    });
    render(<ControlledWebResearch {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("web-search-suggestions");
    expect(called).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox",{name:"APT28 CERT-UA 2023"}));
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByText("Outside report");
    expect(called).toHaveLength(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body)).queries)
      .toEqual(["APT28 router compromise"]);
    const read=screen.getByRole("button",{name:"Read with AI: Outside report"});
    expect(read.getAttribute("data-testid")).toBe("web-read-with-ai");
    expect(read.hasAttribute("disabled")).toBe(false);
    const add=screen.getByRole("link",{name:/Add to Collection/}) as HTMLAnchorElement;
    expect(add.href).toContain("/sources?research_url=");
    expect(decodeURIComponent(add.href)).toContain("https://example.org/report");
    expect(called.every(url=>!url.includes("/source/create"))).toBe(true);
  });
  it("reads selected web page only after explicit Read with AI",async()=>{
    const calls:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      calls.push(url);
      if(url.endsWith("/plan"))return {ok:true,json:async()=>({queries:["APT28 routers compromise"]})};
      if(url.endsWith("/search"))return {ok:true,json:async()=>({results:[sample]})};
      if(url.endsWith("/synthesize")){
        expect(JSON.parse(String(options?.body)).urls).toEqual([sample.url]);
        return {ok:true,json:async()=>({result:{
          summary:"External reporting describes similar operations.",
          evidence:[{statement:"Example",quote:"Specific quote from the report",
            sourceToken:"WEB_001",url:sample.url,title:sample.title,
            domain:sample.domain,retrievedAt:"2026-10-22T00:00:00Z"}],
          discarded:0,differences:[],unansweredQuestions:[],
          warnings:["Analyst review required."],
        }})};
      }
      throw Error("Unexpected call "+url);
    });
    render(<ControlledWebResearch {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("web-search-suggestions");
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByText("Outside report");
    expect(calls).toHaveLength(2);
    fireEvent.click(screen.getByRole("button",{name:"Read with AI: Outside report"}));
    await screen.findByText("External reporting describes similar operations.");
    expect(screen.getByText("Specific quote from the report")).toBeTruthy();
    expect(screen.getByText(/WEB_001/)).toBeTruthy();
    expect(calls).toHaveLength(3);
  });
  it("requires page or annotation to suggest queries",()=>{
    render(<ControlledWebResearch {...props} context={{kind:"document"}}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    expect(screen.getByRole("button",{name:"Suggest searches"}).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Select a PDF page, page range or annotation/)).toBeTruthy();
  });
});
