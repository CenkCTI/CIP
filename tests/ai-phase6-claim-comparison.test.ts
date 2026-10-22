import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {claimComparisonRequestSchema,claimComparisonModelSchema,
  verifyClaimComparison,classifyPdfExcerpt} from "@/lib/ai/research/claim-comparison";
import {safeWebUrl} from "@/lib/ai/research/safe-fetch";

const sourceId="49429515-bc04-4539-ae53-69f0b47157cb";
const assetId="49429615-bc04-4539-ae53-69f0b47157cb";
const request={sourceId,assetId,context:{kind:"page" as const,page:11},
  question:"Compare the claim about African digital television services.",
  urls:["https://example.org/report"],byokConsent:true as const};
const span={token:"DOC_P011_C01",text:"China is the leading provider of digital television services in all of Africa.",
  page:11,sourceId,assetId};
const page={url:"https://example.org/report",title:"African television report",
  domain:"example.org",retrievedAt:"2026-10-22T12:00:00Z",contentType:"text/html" as const,
  text:"StarTimes is the second largest TV provider in Africa, after DStv."};
const model={
  claim:{paraphrase:"China leads digital television services across Africa.",
    source_token:"DOC_P011_C01",
    quote:"China is the leading provider of digital television services in all of Africa."},
  comparisons:[{source_token:"WEB_001",relationship:"contradicts" as const,
    quote:"StarTimes is the second largest TV provider in Africa, after DStv.",
    explanation:"The ranking appears different, but market metrics may differ.",
    limitation:"Provider versus company comparison needs more evidence."}],
  openQuestions:["Which metric defines the leading provider?"],
};

describe("AI Phase 6 grounded claim comparison",()=>{
  it("accepts only analyst-selected sources and a scoped PDF context",()=>{
    expect(claimComparisonRequestSchema.safeParse(request).success).toBe(true);
    for(const invalid of [
      {...request,context:{kind:"document"}},
      {...request,byokConsent:false},
      {...request,sourceText:"FAKE PDF CONTENT"},
      {...request,webText:"FAKE WEB CONTENT"},
      {...request,autonomousSearch:true},
      {...request,urls:Array(4).fill(page.url)},
      {...request,urls:[page.url,page.url]},
      {...request,sourceId:"not-a-uuid"},
    ])expect(claimComparisonRequestSchema.safeParse(invalid).success).toBe(false);
    expect(()=>safeWebUrl("https://127.0.0.1/private")).toThrow();
  });
  it("verifies PDF and web quotations independently with server-side texts",()=>{
    const parsed=claimComparisonModelSchema.parse(model);
    const result=verifyClaimComparison(parsed,[span],[page]);
    expect(result).not.toBeNull();
    expect(result?.pdfClaim.page).toBe(11);
    expect(result?.pdfClaim.sourceId).toBe(sourceId);
    expect(result?.rows[0]).toMatchObject({
      sourceToken:"WEB_001",relationship:"contradicts",verifiedQuote:true,evidenceStatus:"verified",
      url:page.url,quote:model.comparisons[0].quote,
    });
    expect(result?.status).toBe("analyst_review_required");
    expect(result?.warnings.join(" ")).toMatch(/not validated conclusions/i);
  });
  it("fails closed for nonexistent PDF quote or spoofed PDF token",()=>{
    expect(verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,claim:{...model.claim,quote:"Unsupported source claim sentence."},
    }),[span],[page])).toBeNull();
    expect(verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,claim:{...model.claim,source_token:"DOC_P002_C01"},
    }),[span],[page])).toBeNull();
  });
  it("downgrades hallucinated WEB quotations instead of claiming corroboration",()=>{
    const result=verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,comparisons:[{...model.comparisons[0],
        relationship:"supports",quote:"A made-up quote about the company."}],
    }),[span],[page]);
    expect(result?.rows[0]).toMatchObject({
      relationship:"insufficient_evidence",verifiedQuote:false,quote:null,
      evidenceStatus:"rejected_quote",
    });
    expect(result?.discarded).toBe(1);
  });
  it("does not transfer a valid quote to a different web source",()=>{
    const other={...page,url:"https://second.example.org/report",domain:"second.example.org",
      text:"This other report discusses a different subject."};
    const result=verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,comparisons:[{...model.comparisons[0],source_token:"WEB_002"}],
    }),[span],[page,other]);
    expect(result?.rows[0].relationship).toBe("insufficient_evidence");
    expect(result?.rows[1].relationship).toBe("insufficient_evidence");
  });
  it("does not turn a reporter's cited question into an established PDF claim",()=>{
    const quoted="Your reports cites examples of China being the leading provider of digital television services in all of Africa.";
    expect(classifyPdfExcerpt(quoted)).toBe("attributed_or_question");
    const out=verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,
      claim:{...model.claim,paraphrase:"China led Africa through StarTimes",quote:quoted},
    }),[{...span,text:quoted}], [page]);
    expect(out?.pdfClaim.originKind).toBe("attributed_or_question");
    expect(out?.pdfClaim.paraphrase).not.toContain("StarTimes");
    expect(out?.warnings.join(" ")).toMatch(/attributed statement or question/i);
  });
  it("distinguishes missing quotes from invalid quotations, never interprets missing as proof of absence",()=>{
    const out=verifyClaimComparison(claimComparisonModelSchema.parse({
      ...model,comparisons:[{...model.comparisons[0],quote:null,
        relationship:"insufficient_evidence"}],
    }),[span],[page]);
    expect(out?.rows[0]).toMatchObject({
      verifiedQuote:false,evidenceStatus:"no_quote",relationship:"insufficient_evidence",
    });
    expect(out?.discarded).toBe(0);
    expect(out?.warnings.join(" ")).toMatch(/do NOT prove/i);
  });
  it("endpoint only reads owned project source and externally selected URLs",()=>{
    const path="src/app/api/projects/[id]/ai/processing/research/compare/route.ts";
    const source=readFileSync(path,"utf8");
    expect(source).toContain("requireOwnedProject");
    expect(source).toContain("loadStage3DocumentContext");
    expect(source).toContain("readPublicWebPage");
    expect(source).toContain("verifyClaimComparison");
    expect(source).not.toMatch(/(?:supabase|db)\.(?:insert|update|delete|upsert)\s*\(/);
    expect(source).not.toContain("createSourceClaimFromAnnotation");
  });
});
