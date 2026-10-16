import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProcessingCopilot } from "@/components/investigations/source-reader/ai/processing-copilot";
import { COPILOT_WINDOW_KEY, clampGeometry } from "@/components/investigations/source-reader/ai/use-copilot-window";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";

vi.mock("@/components/ai/byok-connection-panel",()=>({
  ByokConnectionPanel:()=> <div data-testid="reused-byok-panel">Existing BYOK panel</div>,
}));
const projectId="49429415-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const annId="49429715-bc04-4539-ae53-69f0b47157cb";
const onClose=vi.fn(),onJumpToPage=vi.fn(),onFocusAnnotation=vi.fn();
const successResult={
  result:{
    summary:"The source reports spearphishing.",
    evidence:[{
      statement:"The source alleges a spearphishing campaign.",
      quote:"APT28 used spearphishing emails",
      sourceToken:"DOC_P005_C01",page:5,kind:"PDF",
      provenance:{sourceId,assetId},
    }],
    unansweredQuestions:["Who corroborated this?"],warnings:[],discarded:0,
  },
};
function props(overrides:Record<string,unknown>={}) {
  return {
    projectId,sourceId,assetId,sourceTitle:"Threat intelligence report",
    pageCount:8,activePage:5,selectedAnnotationId:null,
    annotations:[{id:annId,page:5,text:"APT28 used spearphishing emails"}],
    onClose,onJumpToPage,onFocusAnnotation,
    ...overrides,
  };
}

const fetchMock=vi.fn();
beforeEach(()=>{
  fetchMock.mockReset();
  onClose.mockClear();onJumpToPage.mockClear();onFocusAnnotation.mockClear();
  vi.stubGlobal("fetch",fetchMock);
  vi.stubGlobal("matchMedia",()=>({
    matches:false,media:"(max-width: 767px)",addEventListener:vi.fn(),
    removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn(),
  }));
  Object.defineProperty(Element.prototype,"scrollIntoView",{configurable:true,value:vi.fn()});
  sessionStorage.clear();
});
afterEach(()=>{vi.unstubAllGlobals();});

function connected() {
  fetchMock.mockImplementation(async (url:string)=>({
    ok:true,
    json:async()=>String(url).includes("/byok/status")
      ? {enabled:true,connected:true,providerId:"nvidia_nim",provider:"NVIDIA NIM",model:"nvidia/nemotron-3-super-120b-a12b"}
      : successResult,
  }));
}
function disconnected() {
  fetchMock.mockResolvedValue({ok:true,json:async()=>({enabled:true,connected:false,state:"disconnected"})});
}

describe("Stage 3 AI Copilot UI",()=>{
  it("refuses requests before NVIDIA status and explicit disclosure consent",async()=>{
    connected();
    render(<ProcessingCopilot {...props()}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    expect(screen.getByRole("button",{name:"Send"})).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox",{name:"Ask Copilot"}),{target:{value:"What happened?"}});
    expect(screen.getByRole("button",{name:"Send"})).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses BYOK connection UI when disconnected, without accepting other providers as NVIDIA",async()=>{
    disconnected();
    render(<ProcessingCopilot {...props()}/>);
    expect(await screen.findByRole("button",{name:"Connect NVIDIA NIM"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Connect NVIDIA NIM"}));
    expect(screen.getByTestId("reused-byok-panel")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Send"})).toBeDisabled();
  });

  it("asks questions using owned IDs, consent, bounded history, and real page selection",async()=>{
    connected();
    render(<ProcessingCopilot {...props()}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    fireEvent.click(screen.getByRole("checkbox",{name:/Consent to send/}));
    fireEvent.change(screen.getByRole("textbox",{name:"Ask Copilot"}),{target:{value:"What was reported?"}});
    fireEvent.click(screen.getByRole("button",{name:"Send"}));
    await screen.findByText("The source reports spearphishing.");
    const req=JSON.parse(fetchMock.mock.calls.find(args=>String(args[0]).includes("/ai/processing"))?.[1]?.body as string);
    expect(stage3RequestSchema.parse(req)).toMatchObject({
      sourceId,assetId,mode:"ask",context:{kind:"page",page:5},question:"What was reported?",byokConsent:true,
    });
    expect(JSON.stringify(req)).not.toContain("API key");
    fireEvent.click(screen.getByRole("button",{name:"[DOC p.5]"}));
    expect(onJumpToPage).toHaveBeenCalledWith(5);
    expect(screen.getByText("Who corroborated this?")).toBeInTheDocument();
  });

  it("supports annotation context and server-validated Ask/Analyse only",async()=>{
    connected();
    render(<ProcessingCopilot {...props({selectedAnnotationId:annId})}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    fireEvent.click(screen.getByRole("checkbox",{name:/Consent to send/}));
    fireEvent.click(screen.getByRole("button",{name:"Analyse selection"}));
    await screen.findByText("The source reports spearphishing.");
    const req=JSON.parse(fetchMock.mock.calls.find(args=>String(args[0]).includes("/ai/processing"))?.[1]?.body as string);
    expect(stage3RequestSchema.parse(req)).toMatchObject({mode:"analyse",context:{kind:"annotation",annotationId:annId}});
    expect(screen.getByText(/Extraction \/ matching \/ web research: later phases/)).toBeInTheDocument();
  });

  it("keeps conversation history ephemeral and scoped to the selected context",async()=>{
    connected();
    render(<ProcessingCopilot {...props()}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    fireEvent.click(screen.getByRole("checkbox",{name:/Consent to send/}));
    fireEvent.change(screen.getByRole("textbox",{name:"Ask Copilot"}),{target:{value:"First question?"}});
    fireEvent.click(screen.getByRole("button",{name:"Send"}));
    await screen.findByText("The source reports spearphishing.");
    fireEvent.change(screen.getByRole("textbox",{name:"Ask Copilot"}),{target:{value:"Can you elaborate?"}});
    fireEvent.click(screen.getByRole("button",{name:"Send"}));
    await waitFor(()=>expect(fetchMock.mock.calls.filter(args=>String(args[0]).includes("/ai/processing"))).toHaveLength(2));
    const req=JSON.parse(fetchMock.mock.calls.filter(args=>String(args[0]).includes("/ai/processing"))[1][1].body);
    expect(req.history).toEqual([{user:"First question?",assistant:"The source reports spearphishing."}]);
    expect(sessionStorage.getItem(COPILOT_WINDOW_KEY)).not.toContain("First question");
  });

  it("does not expose a working entire-document context before Phase 4",async()=>{
    connected();
    render(<ProcessingCopilot {...props()}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    const opt=screen.getByRole("option",{name:/Entire document/});
    expect(opt).toBeDisabled();
  });

  it("closes by keyboard and provides actual dock and minimize actions",async()=>{
    connected();
    render(<ProcessingCopilot {...props()}/>);
    await screen.findByText(/NVIDIA NIM · nvidia\/nemotron/);
    fireEvent.click(screen.getByRole("button",{name:"Dock AI Copilot"}));
    expect(screen.getByRole("button",{name:"Undock AI Copilot"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Minimize AI Copilot"}));
    expect(screen.getByRole("button",{name:"Restore AI Copilot"})).toBeInTheDocument();
    fireEvent.keyDown(window,{key:"Escape"});
    expect(onClose).toHaveBeenCalled();
  });
});
describe("window persistence geometry",()=>{
  it("bounds geometry to the viewport and never includes credentials",()=>{
    expect(clampGeometry({x:-100,y:-100,width:3000,height:3000,docked:false,minimized:false},1200,800))
      .toMatchObject({x:0,y:0,width:840,height:680});
    expect(COPILOT_WINDOW_KEY).toBe("citem:stage3-ai-window:v1");
  });
});
