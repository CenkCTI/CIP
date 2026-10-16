import { describe, expect, it, vi } from "vitest";
import { resolveStage3ResponseLanguage, stage3LanguagePolicy, plainlyEnglishInsteadOfTurkish } from "@/lib/ai/stage3/language";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";
import { runStage3Processing } from "@/lib/ai/stage3/workflows";

const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const quote="CERT Polska observed a malware campaign targeting Polish institutions.";
const spans=[{token:"DOC_P001_C01",text:quote,page:1,kind:"PDF" as const,sourceId,assetId}];
const base={sourceId,assetId,context:{kind:"page" as const,page:1},mode:"ask" as const,
  question:"bu sayfanın türkçe dilinde özetini yaz",byokConsent:true};
const english=JSON.stringify({
  summary:"The source reported that the campaign was targeting Polish government institutions with malware.",
  evidence:[{statement:"The source reported that the campaign was targeting Polish government institutions.",
    source_token:"DOC_P001_C01",quote}],
  unansweredQuestions:[],warnings:[],
});
const turkish=JSON.stringify({
  summary:"Kaynağa göre CERT Polska, Polonya'daki kurumları hedef alan bir zararlı yazılım kampanyası bildirmiştir.",
  evidence:[{statement:"Kaynak, Polonya kurumlarını hedef alan zararlı yazılım kampanyasından söz ediyor.",
    source_token:"DOC_P001_C01",quote}],
  unansweredQuestions:[],warnings:[],
});

describe("Stage 3 analyst language control",()=>{
  it("resolves the user's actual Turkish questions without using source/document language",()=>{
    expect(resolveStage3ResponseLanguage("türkçe açıklar mısın")).toBe("tr");
    expect(resolveStage3ResponseLanguage("bu sayfanın türkçe dilinde özetini yaz")).toBe("tr");
    expect(resolveStage3ResponseLanguage("bu raporu ozetle")).toBe("tr");
    expect(resolveStage3ResponseLanguage("Explain this technical passage")).toBe("en");
    expect(resolveStage3ResponseLanguage(undefined)).toBe("en");
    expect(resolveStage3ResponseLanguage("Explain this passage","tr")).toBe("tr");
    expect(resolveStage3ResponseLanguage("türkçe özetle","en")).toBe("en");
  });
  it("rejects arbitrary language values without weakening strict request validation",()=>{
    expect(stage3RequestSchema.safeParse({...base,responseLanguage:"tr"}).success).toBe(true);
    expect(stage3RequestSchema.safeParse({...base,responseLanguage:"en"}).success).toBe(true);
    expect(stage3RequestSchema.safeParse({...base,responseLanguage:"ru"}).success).toBe(false);
  });
  it("keeps original-language exact citations while requiring Turkish explanation",()=>{
    const policy=stage3LanguagePolicy("tr","ask");
    expect(policy).toContain("Turkish (tr-TR)");
    expect(policy).toContain("evidence[].statement");
    expect(policy).toContain("evidence[].quote MUST remain a byte-for-byte substring");
    expect(plainlyEnglishInsteadOfTurkish(JSON.parse(english).summary,[JSON.parse(english).evidence[0].statement])).toBe(true);
    expect(plainlyEnglishInsteadOfTurkish(JSON.parse(turkish).summary,[JSON.parse(turkish).evidence[0].statement])).toBe(false);
  });
  it("prompts Turkish before untrusted English PDF text and repairs strongly English output",async()=>{
    const chat=vi.fn().mockResolvedValueOnce(english).mockResolvedValueOnce(turkish);
    const result=await runStage3Processing({request:stage3RequestSchema.parse(base),sourceTitle:"CERT Polska",spans},chat);
    expect(chat).toHaveBeenCalledTimes(2);
    const messages=chat.mock.calls[0][0] as {role:string;content:string}[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("OUTPUT LANGUAGE (trusted server instruction): Turkish");
    expect(messages[1].content.indexOf("CURRENT_ANALYST_REQUEST")).toBeLessThan(messages[1].content.indexOf("SOURCE_DATA"));
    expect(messages[1].content).toContain(base.question);
    expect(chat.mock.calls[1][0].some((m:{content:string})=>m.content.includes("Regenerate the complete JSON"))).toBe(true);
    expect(result.summary).toContain("Kaynağa göre");
    expect(result.evidence[0].statement).toContain("Kaynak,");
    expect(result.evidence[0].quote).toBe(quote);
    expect(result.evidence[0].page).toBe(1);
    expect(result.evidence[0].provenance).toMatchObject({sourceId,assetId});
  });
  it("honors English preference even when latest question is Turkish",async()=>{
    const chat=vi.fn().mockResolvedValue(english);
    const req=stage3RequestSchema.parse({...base,responseLanguage:"en"});
    const response=await runStage3Processing({request:req,sourceTitle:"Source",spans},chat);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(chat.mock.calls[0][0])).toContain("OUTPUT LANGUAGE (trusted server instruction): English");
    expect(response.summary).toContain("The source reported");
  });
  it("returns safe caveat if a model ignores Turkish instruction after one retry",async()=>{
    const chat=vi.fn().mockResolvedValue(english);
    const response=await runStage3Processing({request:stage3RequestSchema.parse(base),sourceTitle:"Source",spans},chat);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(response.warnings.join(" ")).toContain("Türkçe yanıt talimatını karşılayamadı");
    expect(response.evidence[0].quote).toBe(quote);
  });
});
