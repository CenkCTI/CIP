import {describe,it,expect} from "vitest";
import {makeAnalystMessages,verifyAnalystAnswer,runAnalystReasoning} from "@/lib/ai/stage3/analyst-reasoning";
import {requiresExactPdfValueAbstention,requestsSourceGroundedAnswer} from "@/lib/ai/stage3/source-integrity";
import type {Stage3Span} from "@/lib/ai/stage3/provenance";
import type {ReadWebPage} from "@/lib/ai/research/types";

const span:Stage3Span={token:"DOC_P002_C01",text:"CERT Polska observed the collection of IP addresses and file lists.",
  page:2,kind:"PDF",sourceId:"source-id",assetId:"asset-id"};
const page:ReadWebPage={url:"https://example.com/report",title:"External reporting",domain:"example.com",
  retrievedAt:"2026-10-22T12:00:00Z",text:"External reporting describes continued intrusions against ministries.",
  contentType:"text/html"};
const hypothesis={title:"Selection of valuable endpoints",rationale:"Possible reconnaissance before selective follow-on access",
  confidence:"MEDIUM" as const,supportingEvidence:["IP and file-list collection"],
  counterEvidence:["No second-stage payload observed"],tests:["Examine post-infection C2 instructions"]};
describe("Analyst mode evidence and hypothesis trust boundaries",()=>{
  it("keeps background reasoning separate from PDF/WEB source-verified exact quotes",()=>{
    const result=verifyAnalystAnswer({
      summary:"Two alternative explanations remain plausible.",
      hypotheses:[hypothesis],
      evidence:[
        {source_token:"DOC_P002_C01",statement:"Document observation",quote:"collection of IP addresses"},
        {source_token:"WEB_001",statement:"External reporting",quote:"continued intrusions against ministries"},
        {source_token:"WEB_002",statement:"Forged website",quote:"fictitious evidence"},
        {source_token:"DOC_P002_C01",statement:"Forged PDF quote",quote:"victims' secrets were destroyed"},
      ],
      unansweredQuestions:["Which machines were selected?"],warnings:[],
    },[span],[page]);
    expect(result.evidence).toHaveLength(1);
    expect(result.webEvidence).toHaveLength(1);
    expect(result.discarded).toBe(2);
    expect(result.hypotheses[0].confidence).toBe("MEDIUM");
    expect(result.webEvidence[0].url).toBe(page.url);
    expect(result.warnings.some(w=>w.includes("not verified evidence"))).toBe(true);
  });
  it("never grants web retrieval or tools through model text, and labels past memory untrusted",()=>{
    const messages=makeAnalystMessages({question:"What may be the strategic goal?",language:"en",
      notes:"An analyst's ongoing hypothesis",history:[{question:"What happened?",previous_ai_response:"Tentative"}],
      spans:[span],webPages:[page]});
    expect(messages[0].content).toContain("general model knowledge");
    expect(messages[0].content).toContain("Untrusted PDF");
    expect(messages[1].content).toContain("prior_conversation_UNTRUSTED");
    expect(messages[1].content).toContain("WEB_DATA_UNTRUSTED");
    expect(messages[1].content).toContain("https://example.com/report");
  });
});

describe("Fail-closed source integrity for original PDF glyph corruption",()=>{
  const corrupted:Stage3Span={
    token:"MEM_001",page:4,kind:"PDF",sourceId:"source-id",assetId:"asset-id",
    text:"APT28 a exploité CVE-\uE12E0\uE12E3-\uE12E3397 à partir de mars \uE12E0\uE12E\uE12E.",
  };
  const blank={question:"",language:"tr" as const,notes:"",history:[],spans:[corrupted],webPages:[]};
  it("refuses to infer exact dates without any model call",async()=>{
    let calls=0;
    const answer=await runAnalystReasoning({...blank,question:"4. sayfada CVE-2023-23397 başlangıç ve bitiş tarihi nedir?"},async()=>{
      calls++;throw new Error("The unsafe model call must not happen.");
    });
    expect(calls).toBe(0);
    expect(answer.summary).not.toContain("2023");
    expect(answer.evidence).toHaveLength(0);
    expect(answer.hypotheses).toHaveLength(0);
    expect(answer.warnings.some(w=>w.includes("PDF_GLYPH_INTEGRITY_BLOCK"))).toBe(true);
  });
  it("does not block nonnumeric questions or intact-source dates",()=>{
    expect(requiresExactPdfValueAbstention("3. sayfada amaç nedir?",[corrupted])).toBe(false);
    expect(requiresExactPdfValueAbstention("Tarihi nedir?",[span])).toBe(false);
  });
  it("withholds confident source claims when every purported quote fails",async()=>{
    const result=await runAnalystReasoning({...blank,question:"Raporda saldırganın amacı nedir? Kaynak alıntısı göster.",spans:[span]},
      async()=>JSON.stringify({
        summary:"Confident but unverifiable conclusion",hypotheses:[hypothesis],
        evidence:[{statement:"not in source",source_token:"DOC_P002_C01",quote:"Fictitious fabricated original source evidence"}],
        unansweredQuestions:[],warnings:[],
      }));
    expect(result.summary).toContain("doğrulanabilen");
    expect(result.hypotheses).toHaveLength(0);
    expect(result.warnings.some(w=>w.includes("NO_VERIFIED_SOURCE_QUOTE"))).toBe(true);
  });
  it("keeps non-source conceptual questions open to explicitly provisional reasoning",async()=>{
    expect(requestsSourceGroundedAnswer("Saldırganın amacı nedir?")).toBe(false);
    expect(requestsSourceGroundedAnswer("ANSSI raporunun 3. sayfasında ne var?")).toBe(true);
    const result=await runAnalystReasoning({...blank,question:"Saldırganın amacı nedir?",spans:[span]},
      async()=>JSON.stringify({summary:"Conditional hypothesis, not verified evidence",
        hypotheses:[hypothesis],evidence:[],unansweredQuestions:[],warnings:[]}));
    expect(result.summary).toContain("Conditional");
    expect(result.hypotheses).toHaveLength(1);
  });

});
