import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ProcessingCopilot, validCopilotContext } from "@/components/investigations/source-reader/ai/processing-copilot";
import { clampCopilotGeometry, COPILOT_WINDOW_KEY } from "@/components/investigations/source-reader/ai/use-copilot-window";
import { CopilotChat } from "@/components/investigations/source-reader/ai/copilot-chat";

vi.mock("@/components/ai/byok-connection-panel", () => ({
  ByokConnectionPanel: ({ defaultProviderId }: {defaultProviderId:string}) =>
    <div data-testid="existing-byok-panel">Existing BYOK: {defaultProviderId}</div>,
}));

const projectId="49429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429615-bc04-4539-ae53-69f0b47157cb";
const assetId="49429715-bc04-4539-ae53-69f0b47157cb";
const annotationId="49429815-bc04-4539-ae53-69f0b47157cb";
const verified={
  summary:"The source reports use of phishing.",
  evidence:[{statement:"The source reports a phishing attempt.",quote:"phishing was reported",
    sourceToken:"DOC_P005_C01",page:5,kind:"PDF",
    provenance:{sourceId,assetId}}],
  unansweredQuestions:[],warnings:[],discarded:0,
};
const props={projectId,sourceId,assetId,sourceTitle:"Test PDF",selectedAnnotationId:annotationId,
  activePage:5,pageCount:15,onClose:vi.fn(),onNavigate:vi.fn()};
const fetchMock=vi.fn();

beforeEach(()=>{
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch",fetchMock);
});

function mockConnected(){
  fetchMock.mockImplementation(async (url:string,options?:RequestInit)=>{
    if (url==="/api/ai/byok/status") return {ok:true,json:async()=>({enabled:true,connected:true,
      providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b"})};
    if (url===`/api/projects/${projectId}/ai/processing` && options?.method==="POST")
      return {ok:true,json:async()=>({result:verified})};
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("Stage 3 Processing Copilot UI",()=>{
  it("uses the existing BYOK session and sends a bounded, ID-only PDF context",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    const question=screen.getByLabelText(/Ask about Entire PDF/);
    fireEvent.change(question,{target:{value:"What does this source report?"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const sent=fetchMock.mock.calls.find((args)=>args[0]===`/api/projects/${projectId}/ai/processing`);
    expect(sent).toBeTruthy();
    expect(sent![1].headers).toMatchObject({"content-type":"application/json"});
    const body=JSON.parse(sent![1].body);
    expect(body).toEqual({sourceId,assetId,context:{kind:"document"},
      mode:"ask",question:"What does this source report?",byokConsent:true});
    expect(JSON.stringify(body)).not.toMatch(/apiKey|signedUrl|selectedText/);
    fireEvent.click(screen.getByText("Source excerpts · 1"));
    fireEvent.click(screen.getByRole("button",{name:"Go to PDF page 5"}));
    expect(props.onNavigate).toHaveBeenCalledWith(5,undefined);
    expect(screen.getByText(/Enter: send/)).toBeTruthy();
  });

  it("lets the analyst explicitly select Turkish while leaving the source text under server control",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText("Response language"),{target:{value:"tr"}});
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"Explain the passage"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const post=fetchMock.mock.calls.find(([url])=>url===`/api/projects/${projectId}/ai/processing`);
    expect(JSON.parse(post![1].body).responseLanguage).toBe("tr");
    expect(JSON.parse(post![1].body).context).toEqual({kind:"document"});
  });

  it("uses a compact context bar, hides evidence by default and retains CİTEM branding",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    const dialog=screen.getByRole("dialog",{name:"AI Processing Copilot"});
    expect(dialog.className).toContain("var(--surface-panel)");
    expect(dialog.className).toContain("var(--line)");
    expect(screen.getByText("CİTEM / COPILOT")).toBeTruthy();
    expect(screen.getByText("Test PDF")).toBeTruthy();
    expect(screen.getByText(/Entire PDF · 15 pages/)).toBeTruthy();
    expect(screen.getByRole("button",{name:/Change context/}).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText(/Selected pages/)).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:/Change context/}));
    expect(screen.getByLabelText(/Selected pages/)).toBeTruthy();
    expect((screen.getByRole("radio",{name:/^Entire PDF/}) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:/Hide context/}));
    expect(screen.queryByLabelText(/Selected pages/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"Please explain"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const source=screen.getByText("Source excerpts · 1").closest("details");
    expect(source?.open).toBe(false);
    // Native details is closed; jsdom may still expose children in the role tree.
    fireEvent.click(screen.getByText("Source excerpts · 1"));
    expect(source?.open).toBe(true);
    expect(screen.getByRole("button",{name:"Go to PDF page 5"})).toBeTruthy();
  });

  it("switches the default full PDF to the currently displayed page when the analyst requests it",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:/Change context/}));
    fireEvent.click(screen.getByLabelText(/Current page/));
    fireEvent.change(screen.getByLabelText(/Ask about Page 5/),{target:{value:"Explain just this page"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const sent=fetchMock.mock.calls.find(([url])=>url===`/api/projects/${projectId}/ai/processing`);
    expect(JSON.parse(sent![1].body).context).toEqual({kind:"page",page:5});
  });

  it("extracts verified candidates without domain mutations, supports review handoff and dismiss",async()=>{
    const onReviewCandidate=vi.fn();
    const candidate={
      candidateId:"a9f4ed",kind:"SOURCE_CLAIM",claim:"The campaign targeted Polish institutions.",
      claimType:"TARGETING",stance:"ASSERTS",sourceQualifier:null,derivation:"NORMALIZED",
      sourceSupport:[{source_token:"DOC_P005_C01",quote:"phishing was reported"}],
      verifiedSupport:[{statement:"SOURCE_CLAIM",quote:"phishing was reported",sourceToken:"DOC_P005_C01",
        page:5,kind:"PDF",provenance:{sourceId,assetId}}],
      caveats:[],status:"NOT_SAVED",
    };
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      if(url===`/api/projects/${projectId}/ai/processing` && options?.method==="POST"){
        expect(JSON.parse(String(options.body)).mode).toBe("extract");
        return {ok:true,json:async()=>({result:{candidates:[candidate],warnings:[],discarded:0}})};
      }
      throw Error("Unexpected request");
    });
    render(<ProcessingCopilot {...props} onReviewCandidate={onReviewCandidate}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Extract candidates"}));
    await screen.findByText("The campaign targeted Polish institutions.");
    expect(screen.getByText(/NOT SAVED/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url])=>url===`/api/projects/${projectId}/ai/processing`)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Review in Process"}));
    expect(onReviewCandidate).toHaveBeenCalledWith(candidate);
    expect(fetchMock.mock.calls.filter(([url])=>url===`/api/projects/${projectId}/ai/processing`)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Dismiss"}));
    expect(screen.queryByText("The campaign targeted Polish institutions.")).toBeNull();
  });

  it("automatically falls back to verified pages when a document exceeds the single-call text limit",async()=>{
    const covered:number[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const body=JSON.parse(String(options?.body));
      if(body.context.kind==="document")return {ok:false,status:413,json:async()=>({
        code:"pdf_document_too_large",stage:"source",error:"Single document request too large.",
      })};
      const {pageStart,pageEnd}=body.context;
      for(let p=pageStart;p<=pageEnd;p++)covered.push(p);
      return {ok:true,status:200,json:async()=>({result:{...verified,
        summary:`Pages ${pageStart}-${pageEnd} reviewed`}})};
    });
    render(<ProcessingCopilot {...props} pageCount={16}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText(/16 \/ 16 pages processed/);
    expect(covered).toEqual(Array.from({length:16},(_,i)=>i+1));
    expect(screen.getByText(/Complete/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url])=>url===`/api/projects/${projectId}/ai/processing`)).toHaveLength(3);
  });

  it("does not lose completed pages when quota pauses a 205-page PDF and resumes without replay",async()=>{
    const covered:number[]=[];
    let pause=true;
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const body=JSON.parse(String(options?.body));
      if(body.context.kind!=="pages")throw Error("Large document was not batched.");
      const {pageStart,pageEnd}=body.context;
      if(pageStart===9 && pause){
        pause=false;
        return {ok:false,status:429,json:async()=>({code:"rate_limited",stage:"quota"})};
      }
      for(let p=pageStart;p<=pageEnd;p++)covered.push(p);
      return {ok:true,status:200,json:async()=>({result:{...verified,
        summary:`Pages ${pageStart}-${pageEnd} processed`}})};
    });
    render(<ProcessingCopilot {...props} pageCount={205}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByRole("button",{name:"Continue Entire PDF"});
    expect(screen.getByText(/8 \/ 205 pages processed/)).toBeTruthy();
    expect(covered).toEqual([1,2,3,4,5,6,7,8]);
    fireEvent.click(screen.getByRole("button",{name:"Continue Entire PDF"}));
    await screen.findByText(/205 \/ 205 pages processed/);
    expect(covered).toEqual(Array.from({length:205},(_,i)=>i+1));
    expect(screen.getByText(/Complete/)).toBeTruthy();
  });

  it("divides a dense page range without marking its unprocessed pages as complete",async()=>{
    const covered:number[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large"})};
      if(context.pageStart===1 && context.pageEnd===8)
        return {ok:false,status:413,json:async()=>({code:"context_too_large"})};
      for(let p=context.pageStart;p<=context.pageEnd;p++)covered.push(p);
      return {ok:true,status:200,json:async()=>({result:{...verified,
        summary:`Pages ${context.pageStart}-${context.pageEnd} read`}})};
    });
    render(<ProcessingCopilot {...props} pageCount={9}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText(/9 \/ 9 pages processed/);
    expect(covered).toEqual(Array.from({length:9},(_,i)=>i+1));
  });


  it("recovers malformed NVIDIA output by subdividing the failed batch without losing pages",async()=>{
    const covered:number[]=[];
    const attempts:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large",stage:"source"})};
      attempts.push(`${context.pageStart}-${context.pageEnd}`);
      if(context.pageEnd-context.pageStart>=4)
        return {ok:false,status:422,json:async()=>({code:"malformed_output",stage:"nvidia"})};
      for(let page=context.pageStart;page<=context.pageEnd;page++)covered.push(page);
      return {ok:true,status:200,json:async()=>({result:{...verified,
        summary:`Pages ${context.pageStart} to ${context.pageEnd} passed verification`}})};
    });
    render(<ProcessingCopilot {...props} pageCount={12}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText(/12 \/ 12 pages processed/);
    expect(attempts).toEqual(["1-8","1-4","5-8","9-12"]);
    expect(covered).toEqual(Array.from({length:12},(_,i)=>i+1));
    expect(screen.queryByTestId("copilot-error-diagnostic")).toBeNull();
  });

  it("falls back to the whole-document batch planner if a direct NVIDIA answer is malformed",async()=>{
    const scopes:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      scopes.push(context.kind);
      if(context.kind==="document")return {ok:false,status:422,json:async()=>({code:"malformed_output",stage:"nvidia"})};
      return {ok:true,status:200,json:async()=>({result:verified})};
    });
    render(<ProcessingCopilot {...props} pageCount={4}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText(/4 \/ 4 pages processed/);
    expect(scopes).toEqual(["document","pages"]);
  });

  it("flags one-page malformed output while analysing the other pages and retries only the flagged page",async()=>{
    let failure=true;
    const covered:number[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large"})};
      if(context.pageStart===1 && context.pageEnd===1 && failure){
        failure=false;
        return {ok:false,status:422,json:async()=>({code:"malformed_output",stage:"nvidia"})};
      }
      if(context.pageStart===1 && context.pageEnd!==1)
        return {ok:false,status:422,json:async()=>({code:"nvidia_output_exhausted",stage:"nvidia"})};
      for(let p=context.pageStart;p<=context.pageEnd;p++)covered.push(p);
      return {ok:true,status:200,json:async()=>({result:verified})};
    });
    render(<ProcessingCopilot {...props} pageCount={3}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByRole("button",{name:"Retry flagged pages"});
    expect(screen.getByText(/2 \/ 3 pages processed/)).toBeTruthy();
    expect(covered).toEqual([2,3]);
    expect(screen.getByTestId("pdf-needs-review").textContent).toContain("p.1: malformed_output");
    fireEvent.click(screen.getByRole("button",{name:"Retry flagged pages"}));
    await screen.findByText(/3 \/ 3 pages processed/);
    expect(covered).toEqual([2,3,1]);
    expect(screen.queryByTestId("pdf-needs-review")).toBeNull();
  });


  it("splits unverified analyses instead of counting pages without citations",async()=>{
    const succeeded:number[]=[];
    const attempted:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large"})};
      const {pageStart,pageEnd}=context;
      attempted.push(`${pageStart}-${pageEnd}`);
      if(pageStart===1 && pageEnd===8)
        return {ok:false,status:422,json:async()=>({code:"analysis_incomplete",stage:"nvidia"})};
      for(let p=pageStart;p<=pageEnd;p++)succeeded.push(p);
      return {ok:true,status:200,json:async()=>({result:verified})};
    });
    render(<ProcessingCopilot {...props} pageCount={10}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText(/10 \/ 10 pages processed/);
    expect(attempted).toEqual(["1-8","1-4","5-8","9-10"]);
    expect(succeeded).toEqual(Array.from({length:10},(_,i)=>i+1));
  });

  it("flags wrong-language single pages without claiming completion",async()=>{
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:422,json:async()=>({code:"analysis_language_mismatch",stage:"nvidia"})};
      return {ok:false,status:422,json:async()=>({code:"analysis_language_mismatch",stage:"nvidia"})};
    });
    render(<ProcessingCopilot {...props} pageCount={3}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByRole("button",{name:"Retry flagged pages"});
    expect(screen.getByText(/0 \/ 3 pages processed/)).toBeTruthy();
    expect(screen.getByTestId("pdf-needs-review").textContent).toContain("p.3: analysis_language_mismatch");
    expect(screen.queryByText(/^Complete$/)).toBeNull();
  });


  it("continues a 34-page document after page 3 fails, tracks the gap and retries only it",async()=>{
    const succeeded:number[]=[];
    let recover=false;
    const attempted:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large"})};
      const {pageStart,pageEnd}=context;
      attempted.push(`${pageStart}-${pageEnd}`);
      if(pageStart<=3 && pageEnd>=3 && !recover)
        return {ok:false,status:422,json:async()=>({code:"analysis_incomplete",stage:"nvidia"})};
      for(let page=pageStart;page<=pageEnd;page++)succeeded.push(page);
      return {ok:true,status:200,json:async()=>({result:{...verified,
        summary:`Valid pages ${pageStart}-${pageEnd}`}})};
    });
    render(<ProcessingCopilot {...props} pageCount={34}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByRole("button",{name:"Retry flagged pages"});
    expect(screen.getByText(/33 \/ 34 pages processed/)).toBeTruthy();
    expect(screen.getByTestId("pdf-needs-review").textContent).toContain("p.3: analysis_incomplete");
    expect(succeeded).toEqual(Array.from({length:34},(_,i)=>i+1).filter(p=>p!==3));
    const seen=succeeded.length;
    recover=true;
    fireEvent.click(screen.getByRole("button",{name:"Retry flagged pages"}));
    await screen.findByText(/34 \/ 34 pages processed/);
    expect(succeeded.slice(seen)).toEqual([3]);
    expect(attempted[attempted.length-1]).toBe("3-3");
    expect(screen.getByText(/^Complete$/)).toBeTruthy();
  });

  it("still pauses on quota errors without skipping the requested page range",async()=>{
    let quota=true;
    const attempted:string[]=[];
    fetchMock.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({
        connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b",
      })};
      const {context}=JSON.parse(String(options?.body));
      if(context.kind==="document")return {ok:false,status:413,json:async()=>({code:"pdf_document_too_large"})};
      attempted.push(`${context.pageStart}-${context.pageEnd}`);
      if(quota && context.pageStart===9){
        quota=false;
        return {ok:false,status:429,json:async()=>({code:"rate_limited",stage:"quota"})};
      }
      return {ok:true,status:200,json:async()=>({result:verified})};
    });
    render(<ProcessingCopilot {...props} pageCount={17}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByRole("button",{name:"Continue Entire PDF"});
    expect(screen.getByText(/8 \/ 17 pages processed/)).toBeTruthy();
    expect(screen.queryByTestId("pdf-needs-review")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Continue Entire PDF"}));
    await screen.findByText(/17 \/ 17 pages processed/);
    expect(attempted).toEqual(["1-8","9-16","9-16","17-17"]);
  });

  it("requires NVIDIA and reuses BYOK panel, without exposing an API key input in Copilot", async()=>{
    fetchMock.mockResolvedValue({ok:true,json:async()=>({connected:false,enabled:true,state:"disconnected"})});
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA not connected");
    expect(screen.getByTestId("existing-byok-panel").textContent).toContain("nvidia_nim");
    expect(screen.getByRole("button",{name:/^Ask$/}).hasAttribute("disabled")).toBe(true);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(window.sessionStorage.getItem(COPILOT_WINDOW_KEY) ?? "").not.toContain("apiKey");
  });

  it("allows annotation selection, page range, docking and closing",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByRole("button",{name:/Change context/}));
    fireEvent.click(screen.getByLabelText(/Current annotation/));
    fireEvent.click(screen.getByRole("button",{name:"Analyse context"}));
    await screen.findByText("The source reports use of phishing.");
    const sent=fetchMock.mock.calls.find((args)=>args[0]===`/api/projects/${projectId}/ai/processing`);
    expect(JSON.parse(sent![1].body).context).toEqual({kind:"annotation",annotationId});
    fireEvent.click(screen.getByLabelText(/Selected pages/));
    fireEvent.change(screen.getByLabelText("Start page"),{target:{value:"2"}});
    fireEvent.change(screen.getByLabelText("End page"),{target:{value:"14"}});
    expect(screen.getAllByText(/1–10 consecutive pages/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button",{name:"Analyse context"}).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Dock Copilot"}));
    expect(screen.getByRole("button",{name:"Undock Copilot"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Close Copilot"}));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("labels partial source-support explicitly rather than hiding discarded model suggestions",()=>{
    render(<CopilotChat turns={[{id:1,context:{kind:"page",page:5},mode:"analyse",
      prompt:"Analyse",result:{...verified,discarded:2,
        warnings:["Unsupported AI suggestions were discarded."]}}]} onNavigate={vi.fn()}/>);
    expect(screen.getByTestId("copilot-partial-evidence").textContent)
      .toContain("2 unsupported AI suggestions were discarded");
    expect(screen.getByTestId("copilot-partial-evidence").textContent)
      .toContain("not been verified sentence by sentence");
    expect(screen.getByText("phishing was reported")).toBeTruthy();
  });

  it("never creates structured domain records and renders only clickable verified citations",()=>{
    const onNavigate=vi.fn();
    render(<CopilotChat turns={[{id:1,context:{kind:"page",page:5},mode:"ask",prompt:"Explain",
      result:{...verified,evidence:[{...verified.evidence[0],kind:"PDF" as const,
        provenance:{sourceId,assetId,annotationId}}]}}]} onNavigate={onNavigate}/>);
    const item=within(screen.getByTestId("copilot-turn"));
    expect(item.getByText("phishing was reported")).toBeTruthy();
    fireEvent.click(item.getByText("Source excerpts · 1"));
    fireEvent.click(item.getByRole("button",{name:"Go to PDF page 5"}));
    expect(onNavigate).toHaveBeenCalledWith(5,annotationId);
    expect(item.queryByText(/Save Candidate|Create Indicator/)).toBeNull();
  });
});

describe("Window and integration hardening",()=>{
  it("bounds pointer geometry and range requests",()=>{
    const geometry=clampCopilotGeometry({x:9999,y:9999,width:6000,height:5000,
      docked:false,minimized:false},1280,800);
    expect(geometry).toMatchObject({x:24,y:24,width:1256,height:776});
    expect(validCopilotContext({kind:"document"},null)).toBe(true);
    expect(validCopilotContext({kind:"document"},500)).toBe(true);
    expect(validCopilotContext({kind:"pages",pageStart:2,pageEnd:11},20)).toBe(true);
    expect(validCopilotContext({kind:"pages",pageStart:2,pageEnd:12},20)).toBe(false);
    expect(validCopilotContext({kind:"page",page:21},20)).toBe(false);
  });
  it("wires active PDF page reporting, citation jumps and Source Reader integration",()=>{
    const reader=readFileSync("src/components/investigations/source-reader/source-reader-workspace.tsx","utf8");
    const pdf=readFileSync("src/components/investigations/source-reader/pdf/pdf-source-viewer.tsx","utf8");
    expect(reader).toContain("<ProcessingCopilot");
    expect(reader).toContain("onActivePageChange={setActivePdfPage}");
    expect(reader).toContain("jumpToPage={copilotPageJump}");
    expect(reader).toContain("onNavigate={(page, annotationId)");
    expect(pdf).toContain("onPageCountChange");
    expect(pdf).toContain("reportActivePage");
    expect(pdf).toContain("scrollIntoView");
  });
  it("keeps Stage 3 candidate review attached to verified source annotation and analyst-only mutation",()=>{
    const reader=readFileSync("src/components/investigations/source-reader/source-reader-workspace.tsx","utf8");
    const timeline=readFileSync("src/components/investigations/source-reader/annotation-timeline-actions.tsx","utf8");
    const actions=readFileSync("src/components/investigations/source-reader/annotation-processing-actions.tsx","utf8");
    expect(reader).toContain('evidence.provenance.assetId===s(asset.id)');
    expect(reader).toContain('s(annotation.anchor_kind)!=="TEXT"');
    expect(reader).toContain('replace(/\\s+/g," ")');
    expect(reader).toContain("selected.includes(excerpt)");
    expect(timeline).toContain('aiCandidate?.eventName ?? suggestedTitle(annotation)');
    expect(timeline).toContain('aiCandidate?.description');
    expect(timeline).toContain("AI SUGGESTION · NOT SAVED");
    expect(actions).toContain('aiCandidate?.kind === "TIMELINE" ? aiCandidate : null');
    expect(actions).toContain('aiCandidate?.candidateId ?? "manual"');
    expect(actions).not.toContain('defaultValue="SOURCE_EXPLICIT"');
  });
  it("does not include intelligence-domain write APIs in the Copilot implementation",()=>{
    const paths=[
      "src/components/investigations/source-reader/ai/processing-copilot.tsx",
      "src/components/investigations/source-reader/ai/copilot-chat.tsx",
      "src/components/investigations/source-reader/ai/copilot-context-selector.tsx",
      "src/components/investigations/source-reader/ai/use-copilot-window.ts",
    ];
    for (const path of paths) {
      const text=readFileSync(path,"utf8");
      expect(text).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
      expect(text).not.toMatch(/source-(processing|collection)-actions/);
      expect(text).not.toContain("localStorage");
      expect(text).not.toContain("service_role");
    }
  });
});
