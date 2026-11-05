import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanvasAiPanel } from "@/components/canvas/canvas-ai-panel";
import { COPILOT_WINDOW_KEY } from "@/components/investigations/source-reader/ai/use-copilot-window";

vi.mock("@/components/ai/byok-connection-panel", () => ({
  ByokConnectionPanel: ({ onStatusChange }: {
    onStatusChange?: (status: { connected: boolean; providerId: string; model: string }) => void;
  }) => <button type="button" onClick={() => onStatusChange?.({
    connected: true, providerId: "nvidia_nim", model: "nvidia/test",
  })}>Connect test NVIDIA</button>,
}));

const ids=["a72353f5-0a30-42e5-8e84-cd38b89de001","a72353f5-0a30-42e5-8e84-cd38b89de002"];
const aiResult = {
  summary: "An unverified hypothesis needs more evidence.",
  hypotheses: [{title:"Test hypothesis",rationale:"Limited catalog excerpt only.",
    confidence:"LOW" as const,test:"Inspect original records."}],
  observations: [],questions:["Which source can confirm it?"],discarded:0,revision:7,
  usedItems:[{itemId:ids[0],kind:"ANALYST_NOTE" as const,title:"Note"},
    {itemId:ids[1],kind:"CATALOG_SUMMARY" as const,title:"Claim"}],
  linkProposals:[{sourceId:ids[0],targetId:ids[1],
    relationType:"INVESTIGATE" as const,rationale:"Check supporting evidence."}],
  warning:"AI suggestions are provisional. Catalog snippets are not primary-source verification.",
};
function setup() {
  const beforeAnalyze=vi.fn(async()=>7);
  const onApproveLink=vi.fn();
  const onAddDraft=vi.fn();
  const onClose=vi.fn();
  render(<CanvasAiPanel projectId="e87c757f-6d51-456d-8c18-0b287327b201"
    canvasId="e87c757f-6d51-456d-8c18-0b287327b202"
    selectedItemIds={ids} beforeAnalyze={beforeAnalyze}
    onApproveLink={onApproveLink} onAddDraft={onAddDraft}
    onClose={onClose} canApply />);
  return {beforeAnalyze,onApproveLink,onAddDraft,onClose};
}

afterEach(()=>{
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("CANVAS-5 Source Reader-style floating Copilot",()=>{
  it("uses a dialog window with Source Copilot controls and isolated geometry",async()=>{
    // User's existing Source Reader popup preference must not be overwritten.
    window.sessionStorage.setItem(COPILOT_WINDOW_KEY,
      JSON.stringify({x:12,y:33,width:570,height:550,docked:false,minimized:false}));
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({
      ok:true,json:async()=>({connected:true,providerId:"nvidia_nim",model:"nvidia/test"}),
    }));
    setup();
    const dialog=screen.getByRole("dialog",{name:"Canvas AI Copilot"});
    expect(dialog).toHaveClass("fixed");
    expect(dialog).toHaveAttribute("aria-modal","false");
    expect(screen.getByText("CİTEM / COPILOT")).toBeInTheDocument();
    expect(screen.getByRole("separator",{name:"Resize Canvas Copilot"})).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button",{name:"Canvas Copilot settings"}));
    expect(screen.getByRole("region",{name:"Canvas Copilot preferences"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Close Canvas Copilot settings"}));
    expect(screen.queryByRole("region",{name:"Canvas Copilot preferences"})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button",{name:"Dock Canvas Copilot"}));
    expect(screen.getByRole("button",{name:"Undock Canvas Copilot"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Undock Canvas Copilot"}));
    fireEvent.click(screen.getByRole("button",{name:"Minimize Canvas Copilot"}));
    expect(screen.queryByRole("textbox",{name:"Ask about selected Canvas cards"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Restore Canvas Copilot"}));
    expect(screen.getByRole("textbox",{name:"Ask about selected Canvas cards"})).toBeInTheDocument();

    await waitFor(()=>expect(window.sessionStorage.getItem("citem:canvas-ai-window:v1")).not.toBeNull());
    expect(JSON.parse(window.sessionStorage.getItem(COPILOT_WINDOW_KEY)||"{}").width).toBe(570);
  });

  it("needs per-request consent, never changes Canvas until analyst approves",async()=>{
    const fetchMock=vi.fn(async(url:string)=>{
      if(url==="/api/ai/byok/status")return {
        ok:true,json:async()=>({connected:true,providerId:"nvidia_nim",model:"nvidia/test"}),
      };
      if(url.endsWith("/assist"))return {ok:true,json:async()=>({result:aiResult})};
      throw Error("Unexpected fetch "+url);
    });
    vi.stubGlobal("fetch",fetchMock);
    const actions=setup();
    fireEvent.change(screen.getByRole("textbox",{name:"Ask about selected Canvas cards"}),{
      target:{value:"What alternative hypotheses should be tested?"},
    });
    expect(screen.getByRole("button",{name:"Ask analyst"})).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox",{
      name:"I consent to send selected context to NVIDIA NIM",
    }));
    fireEvent.click(screen.getByRole("button",{name:"Ask analyst"}));
    expect(await screen.findByText("Test hypothesis")).toBeInTheDocument();
    expect(actions.beforeAnalyze).toHaveBeenCalledOnce();
    expect(actions.onApproveLink).not.toHaveBeenCalled();
    expect(actions.onAddDraft).not.toHaveBeenCalled();
    const req=fetchMock.mock.calls.find(([url])=>String(url).endsWith("/assist"));
    const body=JSON.parse(String((req?.[1] as RequestInit)?.body));
    expect(body.selectedItemIds).toEqual(ids);
    expect(body.byokConsent).toBe(true);
    expect(body.expectedRevision).toBe(7);
    fireEvent.click(screen.getByRole("button",{name:"Add link"}));
    expect(actions.onApproveLink).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button",{name:"Add as unverified working note"}));
    expect(actions.onAddDraft).toHaveBeenCalledWith(aiResult);
  });

  it("closes through both header action and Escape",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue({
      ok:true,json:async()=>({connected:false}),
    }));
    const actions=setup();
    fireEvent.keyDown(document,{key:"Escape"});
    expect(actions.onClose).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button",{name:"Close Canvas Copilot"}));
    expect(actions.onClose).toHaveBeenCalledTimes(2);
  });
});
