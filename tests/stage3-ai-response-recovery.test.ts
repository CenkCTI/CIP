import { describe, expect, it, vi } from "vitest";
import { parseStage3ModelResponse } from "@/lib/ai/stage3/response-recovery";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";
import { runStage3Processing } from "@/lib/ai/stage3/workflows";
import { assertStage3AnalysisComplete } from "@/lib/ai/stage3/analysis-quality";


const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const quote="The campaign sent e-mails with links redirecting victims to webhook.site.";
const spans=[
  {token:"DOC_P003_C01",text:"Based on the report. "+quote,page:3,
    sourceId,assetId,kind:"PDF" as const},
];
const request=stage3RequestSchema.parse({
  sourceId,assetId,context:{kind:"pages",pageStart:1,pageEnd:5},
  mode:"ask",question:"tam olarak nasıl gerçekleştirmiş bu saldırıyı",
  responseLanguage:"tr",byokConsent:true,
});
const grounded={
  statement:"Rapora göre bağlantılar webhook.site adresine yönlendirilmiştir.",
  source_token:"DOC_P003_C01",
  quote,
};
const good=JSON.stringify({
  summary:"Rapora göre saldırıda e-posta bağlantıları aracılığıyla yönlendirme kullanılmıştır.",
  evidence:[grounded],unansweredQuestions:[],warnings:[],
});

describe("Source-grounded Analyse completion gate",()=>{
  const evidence=[{statement:"Rapora göre e-posta üzerinden kimlik avı gerçekleştirildi.",quote,
    sourceToken:"DOC_P003_C01",page:3,kind:"PDF" as const,
    provenance:{sourceId,assetId}}];
  const analysis={mode:"analyse" as const,responseLanguage:"tr" as const,question:undefined};
  const goodResult={summary:"Raporda kimlik avı saldırısı bildirilmektedir.",evidence,discarded:0,warnings:[]};
  it("accepts a cited Turkish analysis but not an empty or fallback summary",()=>{
    expect(()=>assertStage3AnalysisComplete(analysis,goodResult)).not.toThrow();
    expect(()=>assertStage3AnalysisComplete(analysis,{...goodResult,summary:""}))
      .toThrow(expect.objectContaining({code:"analysis_incomplete"}));
    expect(()=>assertStage3AnalysisComplete(analysis,{...goodResult,evidence:[]}))
      .toThrow(expect.objectContaining({code:"analysis_incomplete"}));
    expect(()=>assertStage3AnalysisComplete(analysis,{...goodResult,discarded:1}))
      .toThrow(expect.objectContaining({code:"analysis_incomplete"}));
    expect(()=>assertStage3AnalysisComplete(analysis,{...goodResult,warnings:[
      "The model did not produce a complete validated response. Only previously verified source quotations are shown."
    ]})).toThrow(expect.objectContaining({code:"analysis_incomplete"}));
  });
  it("rejects unmistakably English analyses when Turkish was explicitly requested",()=>{
    const english="The source reported that the attackers used stolen signing keys and the Microsoft identity system was compromised. The incident was reported and these failures were described in the source, which included the attack timeline.";
    expect(()=>assertStage3AnalysisComplete(analysis,{...goodResult,summary:english}))
      .toThrow(expect.objectContaining({code:"analysis_language_mismatch"}));
    expect(()=>assertStage3AnalysisComplete({...analysis,responseLanguage:"en"},
      {...goodResult,summary:english})).not.toThrow();
  });
  it("does not penalize unanswered Ask requests or legitimately empty extraction",()=>{
    expect(()=>assertStage3AnalysisComplete({...analysis,mode:"ask"},
      {...goodResult,summary:"",evidence:[]})).not.toThrow();
    expect(()=>assertStage3AnalysisComplete({...analysis,mode:"extract"},
      {...goodResult,summary:"",evidence:[]})).not.toThrow();
  });
});

describe("Stage 3 structured output resilience",()=>{
  it("accepts strict schema without modifying source quote",()=>{
    const parsed=parseStage3ModelResponse(good);
    expect(parsed.normalized).toBe(false);
    expect(parsed.invalidEvidence).toBe(0);
    expect(parsed.response.evidence[0].quote).toBe(quote);
  });
  it("recovers omitted warning arrays and harmless model-extra keys but NEVER trusts model page or asset",()=>{
    const loose=JSON.stringify({
      summary:"Belgede e-posta yönlendirmesi bildirilmiştir.",
      evidence:[{...grounded,page:999,source_id:"fake-id",role:"system"}],
      injected:"arbitrary unknown JSON field",
    });
    const parsed=parseStage3ModelResponse(loose);
    expect(parsed.normalized).toBe(true);
    expect(parsed.response.evidence).toHaveLength(1);
    expect(parsed.response.evidence[0]).toEqual(grounded);
    expect(parsed.response.unansweredQuestions).toEqual([]);
    expect(parsed.response.warnings).toEqual([]);
    expect(JSON.stringify(parsed.response)).not.toContain("fake-id");
    expect(JSON.stringify(parsed.response)).not.toContain("999");
  });
  it("drops malformed suggestions individually and keeps quote verification strict",async()=>{
    const loose=JSON.stringify({
      summary:"Raporda e-posta yönlendirmesi bildiriliyor.",
      evidence:[{...grounded,page:999},{statement:"Sahte bilgi",source_token:"DOC_P003_C01",quote:"Evidence of Mars invasion"},
        {statement:33,source_token:"DOC_P003_C01",quote}],
      warnings:["Kontrol edin",null,42],
    });
    const parsed=parseStage3ModelResponse(loose);
    expect(parsed.invalidEvidence).toBe(1);
    expect(parsed.response.evidence).toHaveLength(2);
    const chat=vi.fn().mockResolvedValue(loose);
    const response=await runStage3Processing({request,spans,sourceTitle:"Source"},chat);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(response.evidence).toHaveLength(1);
    expect(response.evidence[0].page).toBe(3);
    expect(response.discarded).toBe(2);
    expect(response.warnings.join(" ")).toContain("discarded");
  });
  it("recovers the answer on a retry when the first response is non-JSON",async()=>{
    const chat=vi.fn().mockResolvedValueOnce("Here is the attack chain in prose, not JSON.")
      .mockResolvedValueOnce(JSON.stringify({
        summary:"Rapor, bağlantıların yönlendirildiğini aktarmaktadır.",
        evidence:[{...grounded,page:3000}], // invented page must be discarded
        warnings:[], // unansweredQuestions omitted by the provider
      }));
    const response=await runStage3Processing({request,spans,sourceTitle:"Source",},chat);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(response.summary).toContain("Rapor");
    expect(response.evidence[0].page).toBe(3);
    expect(response.evidence[0].quote).toBe(quote);
    expect(response.evidence[0].provenance).toEqual({sourceId,assetId});
    const messages=chat.mock.calls[1][0] as {role:string;content:string}[];
    expect(messages.some((m)=>m.content.includes("COMPACT object"))).toBe(true);
    expect(messages.map((m)=>m.content).join(" ")).not.toContain("Here is the attack chain in prose");
  });
  it("never discards already verified evidence when second model attempt is malformed",async()=>{
    const first=JSON.stringify({
      summary:"Saldırganların her ayrıntısı kesin olarak biliniyor.",
      evidence:[grounded,{...grounded,quote:"Unsubstantiated fabricated second quote"}],
      unansweredQuestions:[],warnings:[],
    });
    const chat=vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce("invalid JSON again");
    const result=await runStage3Processing({request,spans,sourceTitle:"Source"},chat);
    expect(result.summary).toBe("");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].quote).toBe(quote);
    expect(result.warnings.join(" ")).toContain("Only previously verified");
    expect(result.discarded).toBe(1);
  });
  it("rejects unsupported and non-JSON answers instead of laundering unsupported claims",async()=>{
    expect(()=>parseStage3ModelResponse("Raw model answer without JSON")).toThrow();
    expect(()=>parseStage3ModelResponse(JSON.stringify({summary:"ok",evidence:"no"}))).toThrow();
    expect(()=>parseStage3ModelResponse("x".repeat(100001))).toThrow();
    await expect(runStage3Processing({
      request,spans,sourceTitle:"Source",
    },vi.fn().mockResolvedValue("not JSON"))).rejects.toMatchObject({code:"malformed_output"});
  });
});
