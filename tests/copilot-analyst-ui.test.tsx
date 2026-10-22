import {render,screen,fireEvent,waitFor} from "@testing-library/react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {ProcessingCopilot} from "@/components/investigations/source-reader/ai/processing-copilot";
vi.mock("@/components/ai/byok-connection-panel",()=>({
  ByokConnectionPanel:()=> <div>BYOK settings</div>,
}));
const projectId="49429515-bc04-4539-ae53-69f0b47157cb";
const sourceId="49429615-bc04-4539-ae53-69f0b47157cb";
const assetId="49429715-bc04-4539-ae53-69f0b47157cb";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("Analyst chat in the normal Copilot composer",()=>{
  it("loads saved investigation history and sends explicitly consented web search without source text",async()=>{
    const calls:{url:string;body?:Record<string,unknown>}[]=[];
    vi.stubGlobal("fetch",vi.fn(async(url:string,options?:RequestInit)=>{
      const body=options?.body?JSON.parse(String(options.body)) as Record<string,unknown>:undefined;
      calls.push({url,body});
      if(url==="/api/ai/byok/status")return {ok:true,json:async()=>({connected:true,providerId:"nvidia_nim",model:"nvidia/nemotron-3-super-120b-a12b"})};
      if(url.includes("/memory") && (!options?.method || options?.method==="GET"))
        return {ok:true,json:async()=>({notes:"Previously reviewed claims are provisional.",
          turns:[{id:"one",question:"What happened?",created_at:"2026-10-22T19:00:00Z",
            context:{context:{kind:"page",page:2}},result:{
              summary:"Previously saved response",hypotheses:[],evidence:[],webEvidence:[],discarded:0,
              unansweredQuestions:[],warnings:[]}}]})};
      if(url.endsWith("/analyst-chat"))
        return {ok:true,json:async()=>({saved:true,result:{
          summary:"The operational objective may be collection and prepositioning.",
          hypotheses:[{title:"Information collection",rationale:"Initial access and reconnaissance",
            confidence:"MEDIUM",supportingEvidence:[],counterEvidence:[],tests:[]}],
          evidence:[],webEvidence:[],discarded:0,unansweredQuestions:[],warnings:[]}})};
      throw Error("Unexpected fetch "+url);
    }));
    render(<ProcessingCopilot projectId={projectId} sourceId={sourceId} assetId={assetId}
      sourceTitle="Storm-0558 PDF" selectedAnnotationId={null}
      activePage={3} pageCount={34} onClose={vi.fn()} onNavigate={vi.fn()}/>);
    await screen.findByText("NVIDIA connected");
    fireEvent.click(screen.getByLabelText(/Analyst chat · persistent investigation memory/));
    await screen.findByText("Previously saved response");
    fireEvent.click(screen.getByLabelText(/Research web for this message/));
    fireEvent.click(screen.getByLabelText(/Include selected PDF evidence/)); // independent question
    const textbox=screen.getByPlaceholderText("Ask a question about the selected source…");
    fireEvent.change(textbox,{target:{value:"Why might APT28 target ministries?"}});
    fireEvent.click(screen.getByRole("button",{name:"Ask analyst"}));
    await screen.findByTestId("copilot-hypotheses");
    const call=calls.find(c=>c.url.endsWith("/analyst-chat"));
    expect(call?.body).toMatchObject({sourceId,assetId,webResearch:true,useSource:false,
      context:{kind:"page",page:3},question:"Why might APT28 target ministries?"});
    expect(call?.body).not.toHaveProperty("pdfText");
    expect(call?.body).not.toHaveProperty("notes");
    await waitFor(()=>expect(screen.getByText("Conversation saved to this investigation")).toBeTruthy());
  });
});
