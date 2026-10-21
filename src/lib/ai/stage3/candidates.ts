import { createHash } from "node:crypto";
import { z } from "zod";
import { sourceClaimKinds, sourceClaimStances } from "@/lib/processing/source-claims";
import { resolveGroundedEvidence, type Stage3Span, type Stage3Support } from "./provenance";
import { extractIndicatorCandidatesFromText } from "@/lib/processing/indicator-extraction";

/** Candidates are suggestions, never an intelligence assessment or an authority to write. */
export const candidateKinds = [
  "SOURCE_CLAIM", "INDICATOR", "TIMELINE", "MALWARE", "CVE", "MITRE",
  "THREAT_ACTOR", "CAMPAIGN", "ATTRIBUTION_CLAIM", "UNANSWERED_QUESTION",
] as const;
export const derivations = ["EXTRACTED", "NORMALIZED", "MAPPED"] as const;
const support = z.object({
  source_token: z.string().regex(/^(?:DOC_P\d{3,5}_C\d{2,3}|ANN_\d{3})$/),
  quote: z.string().trim().min(8).max(1200),
}).strict();
const base = {
  derivation: z.enum(derivations),
  sourceSupport: z.array(support).min(1).max(3),
  caveats: z.array(z.string().trim().min(1).max(240)).max(4),
};
const summary = z.string().trim().min(1).max(700);
const name = z.string().trim().min(1).max(180);
const nullableDate = z.string().trim().max(40).nullable();
const cvId = z.string().regex(/^CVE-\d{4}-\d{4,}$/i);
const mitreId = z.string().regex(/^T\d{4}(?:\.\d{3})?$/i);
export const stage3CandidateModelSchema = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("SOURCE_CLAIM"),...base,claim:summary,claimType:z.enum(sourceClaimKinds),
    stance:z.enum(sourceClaimStances),sourceQualifier:z.string().trim().max(400).nullable()}).strict(),
  z.object({kind:z.literal("INDICATOR"),...base,value:name,indicatorType:z.enum(["IP","CIDR","DOMAIN","URL","HASH","EMAIL","FILE","REGISTRY"])}).strict(),
  z.object({kind:z.literal("TIMELINE"),...base,eventName:name,description:summary,
    sourceTimeExpression:z.string().trim().max(160),normalizedDate:nullableDate,
    temporalPrecision:z.enum(["EXACT","DAY","MONTH","YEAR","SEASON","UNKNOWN"])}).strict(),
  z.object({kind:z.literal("MALWARE"),...base,name}).strict(),
  z.object({kind:z.literal("CVE"),...base,cveId:cvId}).strict(),
  z.object({kind:z.literal("MITRE"),...base,techniqueId:mitreId,explanation:summary}).strict(),
  z.object({kind:z.literal("THREAT_ACTOR"),...base,name}).strict(),
  z.object({kind:z.literal("CAMPAIGN"),...base,name}).strict(),
  z.object({kind:z.literal("ATTRIBUTION_CLAIM"),...base,claimedActorText:name,
    attributionText:summary}).strict(),
  z.object({kind:z.literal("UNANSWERED_QUESTION"),...base,question:summary}).strict(),
]);
export const stage3CandidateResponseSchema = z.object({
  candidates:z.array(stage3CandidateModelSchema).max(24),
  warnings:z.array(z.string().trim().max(320)).max(8),
}).strict();
export type Stage3CandidateModel = z.infer<typeof stage3CandidateModelSchema>;
export type Stage3Candidate = Stage3CandidateModel & {
  candidateId: string;
  verifiedSupport: Stage3Support[];
  status: "NOT_SAVED";
  existingMatches?: {id:string;label:string;matchType:"EXACT"|"POSSIBLE"}[];
  matchStatus?: "CHECKED"|"UNAVAILABLE";
};
export type Stage3CandidateResponse = {candidates: Stage3Candidate[]; warnings:string[]; discarded:number};

function keyFor(value: Stage3CandidateModel, verified: Stage3Support[]): string {
  return createHash("sha256").update(JSON.stringify({
    kind:value.kind, value, quoteTokens:verified.map((v)=>[v.sourceToken,v.quote]),
  })).digest("hex").slice(0,24);
}

function additionalGate(candidate: Stage3CandidateModel, evidence: Stage3Support[]) {
  const quoted = evidence.map((s)=>s.quote).join(" ");
  if (candidate.kind === "ATTRIBUTION_CLAIM") {
    // A mere actor mention is not an attribution. An explicit source assertion,
    // in the ORIGINAL excerpt, is required; the model cannot invent it.
    const affirmative = /\b(?:attribut(?:e|ed|es|ion)|responsib(?:le|ility)|conducted|carried out|associat(?:e|ed|es)|linked to|assess(?:ed|es)?|believ(?:e|ed|es))\b/i;
    if (!affirmative.test(quoted)) return false;
    // The claimed actor and the source's attribution statement must both appear verbatim.
    const normalized = (text:string) => text.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    if (!normalized(quoted).includes(normalized(candidate.claimedActorText))) return false;
    if (!normalized(quoted).includes(normalized(candidate.attributionText))) return false;
    // Negative attribution language does not establish a positive source attribution.
    if (/\b(?:not|never|cannot|can't|no)\b.{0,45}\b(?:attribut(?:e|ed)|associat(?:e|ed)|link(?:ed)?|responsib(?:le|ility))\b/i.test(quoted)) return false;
  }
  if (candidate.kind === "CVE" && !quoted.toUpperCase().includes(candidate.cveId.toUpperCase())) return false;
  if (candidate.kind === "MITRE" && candidate.derivation === "EXTRACTED" &&
    !quoted.toUpperCase().includes(candidate.techniqueId.toUpperCase())) return false;
  if (candidate.kind === "INDICATOR") {
    const parsed = extractIndicatorCandidatesFromText(quoted);
    if (!parsed.some((x)=>x.type === candidate.indicatorType &&
      x.observedValue.toLowerCase() === candidate.value.toLowerCase())) return false;
  }
  if (candidate.kind === "TIMELINE") {
    if (candidate.sourceTimeExpression && !quoted.includes(candidate.sourceTimeExpression)) return false;
    // Never infer an exact date from vague source wording, e.g. "summer 2023".
    // This conservative pass permits only ISO dates literally present in the quote.
    if (candidate.normalizedDate &&
      (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(candidate.normalizedDate) ||
       !quoted.includes(candidate.normalizedDate))) return false;
  }
  if (candidate.kind === "MALWARE" || candidate.kind === "THREAT_ACTOR" || candidate.kind === "CAMPAIGN") {
    if (!quoted.toLocaleLowerCase().includes(candidate.name.toLocaleLowerCase())) return false;
  }
  return true;
}

export function verifyStage3Candidates(input: Stage3CandidateModel[], spans: Stage3Span[]): {
  candidates:Stage3Candidate[]; discarded:number;
} {
  const candidates:Stage3Candidate[]=[];
  let discarded=0;
  const seen=new Set<string>();
  for(const item of input) {
    const verified=resolveGroundedEvidence(
      item.sourceSupport.map((s)=>({statement:item.kind,quote:s.quote,source_token:s.source_token})),spans);
    if(verified.rejected || !verified.accepted.length || !additionalGate(item,verified.accepted)){
      discarded++;continue;
    }
    const id=keyFor(item,verified.accepted);
    if(seen.has(id))continue;
    seen.add(id);
    candidates.push({...item,candidateId:id,verifiedSupport:verified.accepted,status:"NOT_SAVED"});
  }
  return {candidates,discarded};
}
