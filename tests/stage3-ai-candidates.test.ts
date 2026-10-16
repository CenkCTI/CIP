import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { stage3CandidateResponseSchema, verifyStage3Candidates, type Stage3CandidateModel } from "@/lib/ai/stage3/candidates";
import { CANDIDATE_EXTRACTION_POLICY, runStage3CandidateExtraction } from "@/lib/ai/stage3/candidate-workflow";
import { stage3RequestSchema } from "@/lib/ai/stage3/schemas";

const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const text="CERT Polska and CSIRT MON observed phishing targeting Polish government. The campaign redirects to run.mocky.io and webhook.site. Based on technical indicators this can be associated with APT28. CVE-2024-12345 is mentioned. APT28 was observed. The source reports the T1566.002 phishing link technique.";
const span={token:"DOC_P001_C01",text,page:1,kind:"PDF" as const,sourceId,assetId};
const support=(quote:string)=>[{source_token:span.token,quote}];
const claim:Stage3CandidateModel={kind:"SOURCE_CLAIM",claim:"The campaign targeted Polish government institutions.",
  claimType:"TARGETING",stance:"ASSERTS",sourceQualifier:null,derivation:"NORMALIZED",caveats:[],
  sourceSupport:support("phishing targeting Polish government")};
const cve:Stage3CandidateModel={kind:"CVE",cveId:"CVE-2024-12345",derivation:"EXTRACTED",caveats:[],
  sourceSupport:support("CVE-2024-12345 is mentioned")};
const actor:Stage3CandidateModel={kind:"THREAT_ACTOR",name:"APT28",derivation:"EXTRACTED",caveats:[],
  sourceSupport:support("APT28 was observed")};
const attribution:Stage3CandidateModel={kind:"ATTRIBUTION_CLAIM",
  claimedActorText:"APT28",attributionText:"APT28 conducted the attack.",
  derivation:"EXTRACTED",caveats:[],sourceSupport:support("APT28 was observed")};

describe("Stage 3 candidate boundary",()=>{
  it("accepts a strict extraction request but disallows client-provided candidates or sources",()=>{
    const request={sourceId,assetId,context:{kind:"document"},mode:"extract",byokConsent:true};
    expect(stage3RequestSchema.safeParse(request).success).toBe(true);
    expect(stage3RequestSchema.safeParse({...request,sourceText:"fake"}).success).toBe(false);
    expect(stage3RequestSchema.safeParse({...request,candidates:[claim]}).success).toBe(false);
    expect(stage3RequestSchema.safeParse({...request,byokConsent:false}).success).toBe(false);
  });
  it("requires strict kind-specific structured suggestions, not unbounded model extras",()=>{
    expect(stage3CandidateResponseSchema.safeParse({candidates:[claim],warnings:[]}).success).toBe(true);
    expect(stage3CandidateResponseSchema.safeParse({candidates:[{...claim,confidence:0.99}],warnings:[]}).success).toBe(false);
    expect(stage3CandidateResponseSchema.safeParse({candidates:[{...claim,sourceSupport:[]}],warnings:[]}).success).toBe(false);
  });
  it("verifies source quotes with real page provenance and deterministic IDs",()=>{
    const one=verifyStage3Candidates([claim,cve,actor],[span]);
    const two=verifyStage3Candidates([claim,cve,actor],[span]);
    expect(one.discarded).toBe(0);
    expect(one.candidates).toHaveLength(3);
    expect(one.candidates.map(x=>x.candidateId)).toEqual(two.candidates.map(x=>x.candidateId));
    expect(one.candidates.every(x=>x.status==="NOT_SAVED")).toBe(true);
    expect(one.candidates[0].verifiedSupport[0]).toMatchObject({page:1,sourceToken:span.token,
      provenance:{sourceId,assetId}});
  });
  it("discards fabricated quotes, named entities absent from their quote, and mere actor mentions as attribution",()=>{
    const fake:Stage3CandidateModel={...claim,sourceSupport:support("CERT Polska confirmed alien spaceship activity")};
    const fakeName:Stage3CandidateModel={...actor,name:"Unknown attacker"};
    const verified=verifyStage3Candidates([fake,fakeName,attribution,claim],[span]);
    expect(verified.discarded).toBe(3);
    expect(verified.candidates).toHaveLength(1);
    expect(verified.candidates[0].kind).toBe("SOURCE_CLAIM");
  });
  it("requires exact CVE and reported ATT&CK ID; does not treat model fields as evidence",()=>{
    const fakeCve:Stage3CandidateModel={...cve,cveId:"CVE-2030-98765"};
    const mitre:Stage3CandidateModel={kind:"MITRE",techniqueId:"T1566.002",
      explanation:"Phishing link reported.",derivation:"EXTRACTED",caveats:[],
      sourceSupport:support("T1566.002 phishing link technique")};
    const wrongMitre:Stage3CandidateModel={...mitre,techniqueId:"T1059.001"};
    const output=verifyStage3Candidates([fakeCve,cve,mitre,wrongMitre],[span]);
    expect(output.candidates).toHaveLength(2);
    expect(output.discarded).toBe(2);
  });
  it("executes bounded NVIDIA extraction and cites only server-authored source spans",async()=>{
    const model=JSON.stringify({candidates:[claim,cve,actor],warnings:[]});
    const chat=vi.fn().mockResolvedValue(model);
    const result=await runStage3CandidateExtraction({sourceTitle:"Polish CERT",spans:[span]},chat);
    expect(result.candidates).toHaveLength(3);
    expect(chat).toHaveBeenCalledTimes(1);
    const msgs=JSON.stringify(chat.mock.calls[0][0]);
    expect(msgs).toContain("SOURCE_DATA");
    expect(msgs).toContain("DOC_P001_C01");
    expect(msgs).not.toContain(sourceId);
    expect(msgs).not.toContain(assetId);
  });
  it("repairs invalid JSON once and fails safely if both outputs are invalid",async()=>{
    const chat=vi.fn().mockResolvedValueOnce("not JSON").mockResolvedValueOnce(
      JSON.stringify({candidates:[claim],warnings:[]}));
    expect((await runStage3CandidateExtraction({sourceTitle:"Source",spans:[span]},chat)).candidates).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(2);
    await expect(runStage3CandidateExtraction({sourceTitle:"Source",spans:[span]},
      vi.fn().mockResolvedValue("invalid model output"))).rejects.toMatchObject({code:"malformed_output"});
  });
  it("does not import any domain-writing operations in AI extraction files",()=>{
    for(const path of ["src/lib/ai/stage3/candidates.ts","src/lib/ai/stage3/candidate-workflow.ts",
      "src/app/api/projects/[id]/ai/processing/route.ts"]){
      const code=readFileSync(path,"utf8");
      expect(code).not.toMatch(/\.(insert|update|delete|upsert)\s*\(/);
      expect(code).not.toContain("createSourceClaimFromAnnotation");
      expect(code).not.toContain("createAnnotationOutput");
      expect(code).not.toContain("linkAnnotationOutput");
    }
    expect(CANDIDATE_EXTRACTION_POLICY).toContain("Do not include confidence");
    expect(CANDIDATE_EXTRACTION_POLICY).toContain("mere APT mention");
  });
});
