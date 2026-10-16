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
    const question=screen.getByLabelText(/Ask about Page 5/);
    fireEvent.change(question,{target:{value:"What does this source report?"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const sent=fetchMock.mock.calls.find((args)=>args[0]===`/api/projects/${projectId}/ai/processing`);
    expect(sent).toBeTruthy();
    expect(sent![1].headers).toMatchObject({"content-type":"application/json"});
    const body=JSON.parse(sent![1].body);
    expect(body).toEqual({sourceId,assetId,context:{kind:"page",page:5},
      mode:"ask",question:"What does this source report?",byokConsent:true});
    expect(JSON.stringify(body)).not.toMatch(/apiKey|signedUrl|selectedText/);
    fireEvent.click(screen.getByRole("button",{name:"Go to PDF page 5"}));
    expect(props.onNavigate).toHaveBeenCalledWith(5,undefined);
    expect(screen.getByText(/Enter: send/)).toBeTruthy();
  });

  it("lets the analyst explicitly select Turkish while leaving the source text under server control",async()=>{
    mockConnected();
    render(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText("Response language"),{target:{value:"tr"}});
    fireEvent.change(screen.getByLabelText(/Ask about Page 5/),{target:{value:"Explain the passage"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText("The source reports use of phishing.");
    const post=fetchMock.mock.calls.find(([url])=>url===`/api/projects/${projectId}/ai/processing`);
    expect(JSON.parse(post![1].body).responseLanguage).toBe("tr");
    expect(JSON.parse(post![1].body).context).toEqual({kind:"page",page:5});
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

  it("never creates structured domain records and renders only clickable verified citations",()=>{
    const onNavigate=vi.fn();
    render(<CopilotChat turns={[{id:1,context:{kind:"page",page:5},mode:"ask",prompt:"Explain",
      result:{...verified,evidence:[{...verified.evidence[0],kind:"PDF" as const,
        provenance:{sourceId,assetId,annotationId}}]}}]} onNavigate={onNavigate}/>);
    const item=within(screen.getByTestId("copilot-turn"));
    expect(item.getByText("phishing was reported")).toBeTruthy();
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
