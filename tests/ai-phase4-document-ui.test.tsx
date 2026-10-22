import {render,screen,fireEvent} from "@testing-library/react";
import {describe,it,expect,beforeEach,vi} from "vitest";
import {ProcessingCopilot} from "@/components/investigations/source-reader/ai/processing-copilot";
vi.mock("@/components/ai/byok-connection-panel",()=>({
  ByokConnectionPanel:()=> <div data-testid="existing-byok-panel">BYOK</div>,
}));
const projectId="49429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429615-bc04-4539-ae53-69f0b47157cb";
const assetId="49429715-bc04-4539-ae53-69f0b47157cb";
const props={projectId,sourceId,assetId,sourceTitle:"Storm-0558 PDF",
  selectedAnnotationId:null,activePage:1,pageCount:34,onClose:vi.fn(),
  onNavigate:vi.fn(),onReviewCandidate:vi.fn()};
const ids=["a".repeat(40),"b".repeat(40),"c".repeat(40)];
const manifest={fingerprint:"1".repeat(24),scanVersion:"phase4-document-v1",pageCount:34,
  limits:{chunkChars:8000,overlap:400,maxChunks:24,maxCandidates:150,maxSelectedPages:20,concurrency:2},
  chunks:ids.map((chunkId,i)=>({chunkId,ordinal:i+1,
    pageStart:i*10+1,pageEnd:i===2?34:(i+1)*10,chars:7900}))};
const support=(page:number)=>({statement:"INDICATOR",quote:"example.com",
  sourceToken:"DOC_P"+String(page).padStart(3,"0")+"_C01",page,kind:"PDF",
  provenance:{sourceId,assetId}});
const candidate=(page:number)=>({kind:"INDICATOR",candidateId:"candidate-"+page,
  value:page===1?"example.com":"Example.COM",indicatorType:"DOMAIN",derivation:"EXTRACTED",
  sourceSupport:[{source_token:support(page).sourceToken,quote:"example.com"}],
  verifiedSupport:[support(page)],caveats:[],status:"NOT_SAVED"});
const fetchMock=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch",fetchMock);
});
describe("AI Phase 4 review queue",()=>{
  it("extracts document chunks, aggregates exact IOC identity and sends review to analyst only",async()=>{
    const calls:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b"})};
      if(url.endsWith("/prepare"))return {ok:true,json:async()=>({manifest})};
      if(url.endsWith("/aggregate")){
        const input=JSON.parse(String(options?.body));
        expect(input.chunks).toHaveLength(3);
        return {ok:true,json:async()=>({result:{discarded:0,warnings:[],
          candidates:[{...candidate(1),candidateId:"INDICATOR:DOMAIN:example.com",
            verifiedSupport:[support(1),support(11)]}],
        }})};
      }
      if(url.endsWith("/chunk")){
        const {chunkId,sourceId:s,assetId:a}=JSON.parse(String(options?.body));
        expect([s,a]).toEqual([sourceId,assetId]);
        expect(String(options?.body)).not.toMatch(/apiKey|selectedText|signedUrl/);
        calls.push(chunkId);
        const page=chunkId===ids[0]?1:chunkId===ids[1]?11:21;
        return {ok:true,json:async()=>({chunkId,result:{
          candidates:page===21?[]:[candidate(page)],warnings:[],discarded:0,
        }})};
      }
      throw Error("Unexpected fetch "+url);
    });
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Extract whole PDF"}));
    await screen.findByText(/3 \/ 3 chunks verified/);
    expect(calls).toHaveLength(3);
    expect(screen.getByText(/1 candidate suggestions/)).toBeTruthy();
    const section=screen.getByTestId("document-processing-review");
    expect(section.textContent).toContain("1 empty");
    fireEvent.click(screen.getByText(/Verified source support/));
    expect(screen.getByText("PDF page 1 ↗")).toBeTruthy();
    expect(screen.getByText("PDF page 11 ↗")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Review in Process"}));
    expect(props.onReviewCandidate).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url])=>url==="/api/ai/byok/status" ||
      url.includes("/ai/processing/memory?")||
      url.endsWith("/prepare")||url.endsWith("/chunk")||url.endsWith("/aggregate"))).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Dismiss"}));
    expect(screen.queryByText("example.com")).toBeNull();
  });
  it("keeps 429 chunk pending and resumes without reprocessing previous verified chunk",async()=>{
    let limited=true;
    const attempts:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim"})};
      if(url.endsWith("/prepare"))return {ok:true,json:async()=>({manifest})};
      if(url.endsWith("/aggregate"))return {ok:true,json:async()=>({
        result:{candidates:[],discarded:0,warnings:[]},
      })};
      if(url.endsWith("/chunk")){
        const {chunkId}=JSON.parse(String(options?.body));attempts.push(chunkId);
        if(chunkId===ids[1] && limited){limited=false;return {ok:false,status:429,
          json:async()=>({code:"rate_limited",stage:"quota"})};}
        return {ok:true,json:async()=>({chunkId,result:{
          candidates:[],discarded:0,warnings:[],
        }})};
      }
      throw Error("Unexpected request");
    });
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Extract whole PDF"}));
    await screen.findByRole("button",{name:"Continue document scan"});
    expect(screen.getByTestId("document-processing-review").textContent).toContain("paused");
    fireEvent.click(screen.getByRole("button",{name:"Continue document scan"}));
    await screen.findByText(/3 \/ 3 chunks verified/);
    expect(attempts.filter(x=>x===ids[0])).toHaveLength(1);
    expect(attempts.filter(x=>x===ids[1])).toHaveLength(2);
  });
});
