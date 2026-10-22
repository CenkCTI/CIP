import {render,screen,fireEvent} from "@testing-library/react";
import {describe,it,expect,beforeEach,vi} from "vitest";
import {ControlledWebResearch} from "@/components/investigations/source-reader/ai/controlled-web-research";

const props={projectId:"49429515-bc04-4539-ae53-69f0b47157cb",
  sourceId:"49429615-bc04-4539-ae53-69f0b47157cb",
  assetId:"49429715-bc04-4539-ae53-69f0b47157cb",
  context:{kind:"page" as const,page:11},connected:true};
const sample=(n:number)=>({title:"Outside report "+n,
  url:"https://example.org/report-"+n,domain:"example.org",
  snippet:"Public research excerpt",publisher:"example.org",
  publishedAt:null,query:"TV in Africa 2023"});
const fetchMock=vi.fn();
beforeEach(()=>{fetchMock.mockReset();vi.stubGlobal("fetch",fetchMock);});

describe("AI Phase 6 explicit compare + grounded review",()=>{
  it("requires explicit approval, selects up to 3 URLs and shows a sourced matrix",async()=>{
    const sources=[sample(1),sample(2),sample(3),sample(4)];
    const calls:string[]=[];
    const navigate=vi.fn();
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      calls.push(url);
      if(url.endsWith("/plan"))return {ok:true,json:async()=>({queries:["China television Africa 2023"]})};
      if(url.endsWith("/search"))return {ok:true,json:async()=>({results:sources})};
      if(url.endsWith("/compare")){
        const body=JSON.parse(String(options?.body));
        expect(body).toMatchObject({sourceId:props.sourceId,assetId:props.assetId,
          context:{kind:"page",page:11},byokConsent:true});
        expect(body).not.toHaveProperty("sourceText");
        expect(body).not.toHaveProperty("webText");
        expect(body.urls).toEqual([sources[0].url,sources[1].url]);
        return {ok:true,json:async()=>({result:{
          pdfClaim:{paraphrase:"PDF source claim",quote:"Quoted PDF evidence",
            sourceToken:"DOC_P011_C01",originKind:"unclassified",sourceId:props.sourceId,
            assetId:props.assetId,page:11},
          rows:[{sourceToken:"WEB_001",url:sources[0].url,title:"Outside report 1",
            domain:"example.org",retrievedAt:"2026-10-22T00:00:00Z",
            relationship:"qualifies",quote:"External source quote",
            explanation:"Needs review",limitation:"Different metrics",
            verifiedQuote:true,evidenceStatus:"verified"}],
          openQuestions:["Which definition?"],discarded:0,
          warnings:["Relationships are AI suggestions."],status:"analyst_review_required",
          skippedSources:[],
        }})};
      }
      throw Error("Unexpected request "+url);
    });
    render(<ControlledWebResearch {...props} onNavigate={navigate}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("web-search-suggestions");
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByText("Outside report 1");
    expect(calls).toHaveLength(2);
    expect(screen.getByRole("button",{name:"Compare selected with PDF (0/3)"})
      .hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox",{name:"Compare: Outside report 1"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Compare: Outside report 2"}));
    fireEvent.click(screen.getByRole("button",{name:"Compare selected with PDF (2/3)"}));
    await screen.findByTestId("claim-comparison-review");
    expect(calls).toHaveLength(3);
    expect(screen.getByText("Quoted PDF evidence")).toBeTruthy();
    expect(screen.getByText("External source quote")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Go to PDF evidence"}));
    expect(navigate).toHaveBeenCalledWith(11,undefined);
  });
  it("shows unreadable sources without claiming contradiction or support",async()=>{
    const sources=[sample(1),sample(2)];
    fetchMock.mockImplementation(async(url:string)=>{
      if(url.endsWith("/plan"))return {ok:true,json:async()=>({queries:["Africa media providers 2023"]})};
      if(url.endsWith("/search"))return {ok:true,json:async()=>({results:sources})};
      if(url.endsWith("/compare"))return {ok:true,json:async()=>({result:{
        status:"sources_unavailable",skippedSources:[
          {url:sources[0].url,reason:"unavailable"},
          {url:sources[1].url,reason:"timeout"}],
      }})};
      throw Error("Unexpected "+url);
    });
    render(<ControlledWebResearch {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("web-search-suggestions");
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByText("Outside report 1");
    fireEvent.click(screen.getByRole("checkbox",{name:"Compare: Outside report 1"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"Compare: Outside report 2"}));
    fireEvent.click(screen.getByRole("button",{name:"Compare selected with PDF (2/3)"}));
    await screen.findByText("No web pages could be read");
    expect(screen.getByTestId("unreadable-comparison-sources")).toBeTruthy();
    expect(screen.getByText("Fetch timed out")).toBeTruthy();
    expect(screen.queryByText("Potential support")).toBeNull();
  });
  it("prevents choosing more than 3 external sources for a comparison",async()=>{
    fetchMock.mockImplementation(async(url:string)=>{
      if(url.endsWith("/plan"))return {ok:true,json:async()=>({queries:["Chinese media Africa"]})};
      if(url.endsWith("/search"))return {ok:true,json:async()=>({results:[1,2,3,4].map(sample)})};
      throw Error("Unexpected call "+url);
    });
    render(<ControlledWebResearch {...props}/>);
    fireEvent.click(screen.getByRole("button",{name:/Controlled Web Research/}));
    fireEvent.click(screen.getByRole("button",{name:"Suggest searches"}));
    await screen.findByTestId("web-search-suggestions");
    fireEvent.click(screen.getByRole("button",{name:"Search selected"}));
    await screen.findByText("Outside report 4");
    for(const n of [1,2,3])fireEvent.click(screen.getByRole("checkbox",{name:"Compare: Outside report "+n}));
    expect(screen.getByRole("checkbox",{name:"Compare: Outside report 4"}).hasAttribute("disabled")).toBe(true);
  });
});
