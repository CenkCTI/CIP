import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { ProcessingCopilot, isNvidiaByokConnection } from "@/components/investigations/source-reader/ai/processing-copilot";

const projectId="29429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="29429615-bc04-4539-ae53-69f0b47157cb";
const assetId="29429715-bc04-4539-ae53-69f0b47157cb";
const model="nvidia/nemotron-3-super-120b-a12b";
const requestUrl=`/api/projects/${projectId}/ai/processing`;
const props={projectId,sourceId,assetId,sourceTitle:"Test PDF",selectedAnnotationId:null,
  activePage:5,pageCount:8,onClose:vi.fn(),onNavigate:vi.fn()};
const response={
  result:{
    summary:"A source-reported fact.",
    evidence:[{statement:"It mentions a phishing attempt.",quote:"reported phishing",
      sourceToken:"DOC_P005_C01",page:5,kind:"PDF",
      provenance:{sourceId,assetId}}],
    unansweredQuestions:[],warnings:[],discarded:0,
  },
};
const fetchMock=vi.fn();

beforeEach(()=>{
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch",fetchMock);
});

function renderLegacy(element:ReactElement){
  const rendered=render(element);
  fireEvent.click(screen.getByRole("button",{name:"Copilot settings"}));
  fireEvent.click(screen.getByLabelText(/Analyst chat · persistent investigation memory/));
  fireEvent.click(screen.getByRole("button",{name:"Close settings"}));
  return rendered;
}

function connectAfterDisconnected() {
  fetchMock.mockImplementation(async (url:string,options?:RequestInit)=>{
    if (url==="/api/ai/byok/status") return {ok:true,json:async()=>({connected:false,enabled:true,providers:[]})};
    if (url==="/api/ai/byok/connect") {
      const body=JSON.parse(String(options?.body));
      expect(body.providerId).toBe("nvidia_nim");
      expect(body.model).toBe(model);
      expect(body.scope).toBe("user");
      expect(body.consent).toBe(true);
      // Replicates the legacy API response without providerId that previously disabled Ask.
      return {ok:true,json:async()=>({connected:true,provider:"NVIDIA NIM",model})};
    }
    if (url===requestUrl) return {ok:true,json:async()=>response};
    throw Error("Unexpected fetch: "+url);
  });
}

describe("NVIDIA BYOK to Copilot send integration",()=>{
  it("connects with the existing panel and enables Ask immediately without a page refresh",async()=>{
    connectAfterDisconnected();
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA not connected");
    const ask=screen.getByRole("button",{name:/^Ask$/});
    expect(ask.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Copilot settings"}));
    fireEvent.click(screen.getByText(/NVIDIA BYOK ·/));
    const modelSelect=screen.getByLabelText("BYOK model ID") as HTMLSelectElement;
    expect(modelSelect.tagName).toBe("SELECT");
    expect(modelSelect.value).toBe(model);
    expect(screen.getByRole("option",{name:/Nemotron 3 Super 120B · Recommended/})).toBeTruthy();
    fireEvent.change(screen.getByLabelText("BYOK API key"),{target:{value:"mock-ci-key-not-real"}});
    fireEvent.click(screen.getByRole("button",{name:"Test and Connect"}));
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"What does this page report?"}});
    await waitFor(()=>expect(ask.hasAttribute("disabled")).toBe(false));
    fireEvent.keyDown(screen.getByLabelText(/Ask about Entire PDF/),{key:"Enter",code:"Enter"});
    await screen.findByText("A source-reported fact.");
    const sent=fetchMock.mock.calls.find(([url])=>url===requestUrl);
    expect(sent).toBeTruthy();
    expect(JSON.parse(String(sent![1].body))).toEqual({
      sourceId,assetId,context:{kind:"document"},
      mode:"ask",question:"What does this page report?",byokConsent:true,
    });
  });

  it("rejects non-NVIDIA connections even when connected=true",()=>{
    expect(isNvidiaByokConnection({connected:true,provider:"NVIDIA NIM"})).toBe(true);
    expect(isNvidiaByokConnection({connected:true,providerId:"nvidia_nim"})).toBe(true);
    expect(isNvidiaByokConnection({connected:true,providerId:"openai",provider:"NVIDIA NIM"})).toBe(false);
    expect(isNvidiaByokConnection({connected:true,provider:"OpenAI"})).toBe(false);
    expect(isNvidiaByokConnection({connected:false,provider:"NVIDIA NIM"})).toBe(false);
  });

  it("shows the response error and preserves the question on API failure",async()=>{
    fetchMock.mockImplementation(async (url:string)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({connected:true,enabled:true,providerId:"nvidia_nim",model})};
      if(url===requestUrl)return {ok:false,json:async()=>({code:"rate_limited",error:"Quota exceeded"})};
      throw Error("Unexpected fetch");
    });
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    const question=screen.getByLabelText(/Ask about Entire PDF/);
    fireEvent.change(question,{target:{value:"Why did this happen?"}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByRole("alert");
    expect(screen.getByText(/CİTEM.s hourly AI quota is full/)).toBeTruthy();
    expect((question as HTMLTextAreaElement).value).toBe("Why did this happen?");
  });
  it("sends up to three same-context turns for follow-up but not after selecting another scope",async()=>{
    let responseNumber=0;
    fetchMock.mockImplementation(async (url:string)=>{
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({connected:true,enabled:true,providerId:"nvidia_nim",model})};
      if(url===requestUrl){
        responseNumber++;
        return {ok:true,json:async()=>({result:{...response.result,summary:"Answer "+responseNumber}})};
      }
      throw Error("Unexpected fetch");
    });
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    const question=screen.getByLabelText(/Ask about Entire PDF/);
    const ask=screen.getByRole("button",{name:/^Ask$/});
    fireEvent.change(question,{target:{value:"What did it report?"}});
    fireEvent.click(ask);
    await screen.findByText("Answer 1");
    fireEvent.change(question,{target:{value:"What does that mean?"}});
    fireEvent.click(ask);
    await screen.findByText("Answer 2");
    const calls=fetchMock.mock.calls.filter(([url])=>url===requestUrl);
    expect(JSON.parse(String(calls[1][1].body)).history).toEqual([
      {user:"What did it report?",assistant:"Answer 1"},
    ]);

    fireEvent.click(screen.getByRole("button",{name:/Change context/}));
    fireEvent.click(screen.getByLabelText(/Selected pages/));
    fireEvent.change(screen.getByLabelText(/Ask about Pages/),{target:{value:"Summarize those pages"}});
    fireEvent.click(ask);
    await screen.findByText("Answer 3");
    const updated=fetchMock.mock.calls.filter(([url])=>url===requestUrl);
    expect(JSON.parse(String(updated[2][1].body)).history).toBeUndefined();
  });

  it("shows NVIDIA generation rejection rather than the generic request failure", async () => {
    fetchMock.mockImplementation(async (url:string)=>{
      if (url==="/api/ai/byok/status") return {ok:true,json:async()=>({connected:true,enabled:true,providerId:"nvidia_nim",model})};
      if (url===requestUrl) return {ok:false,status:502,json:async()=>({
        code:"provider_error",error:"NVIDIA rejected this generation request.",stage:"nvidia",
      })};
      throw Error("Unexpected fetch");
    });
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"Explain this campaign."}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText(/NVIDIA rejected the generation request/);
    expect(screen.getByTestId("copilot-error-diagnostic").textContent).toContain("HTTP 502");
    expect(screen.getByTestId("copilot-error-diagnostic").textContent).toContain("stage=nvidia");
    expect(screen.getByTestId("copilot-error-diagnostic").textContent).toContain("code=provider_error");
  });

  it("exposes safe stage and code for unexpected server failures", async () => {
    fetchMock.mockImplementation(async (url:string)=>{
      if (url==="/api/ai/byok/status") return {ok:true,json:async()=>({connected:true,providerId:"nvidia_nim",model})};
      if (url===requestUrl) return {ok:false,status:500,json:async()=>({
        code:"request_failed",error:"Processing request failed.",stage:"source",sourceStep:"pdf_extract",
      })};
      throw Error("Unexpected fetch");
    });
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"Summarize."}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText(/could not complete processing/);
    const diag=screen.getByTestId("copilot-error-diagnostic").textContent ?? "";
    expect(diag).toContain("HTTP 500");
    expect(diag).toContain("stage=source");
    expect(diag).toContain("sourceStep=pdf_extract");
    expect(diag).toContain("code=request_failed");
    expect(diag).not.toContain("API key");
  });

  it("keeps non-JSON server response failures distinguishable from provider errors", async () => {
    fetchMock.mockImplementation(async (url:string)=>{
      if (url==="/api/ai/byok/status") return {ok:true,json:async()=>({connected:true,providerId:"nvidia_nim",model})};
      if (url===requestUrl) return {ok:false,status:502,json:async()=>{throw new SyntaxError("not JSON")}};
      throw Error("Unexpected fetch");
    });
    renderLegacy(<ProcessingCopilot {...props}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.change(screen.getByLabelText(/Ask about Entire PDF/),{target:{value:"Summarize."}});
    fireEvent.click(screen.getByRole("button",{name:/^Ask$/}));
    await screen.findByText(/non-JSON response/);
    expect(screen.getByTestId("copilot-error-diagnostic").textContent).toContain("code=non_json_response");
  });

});
