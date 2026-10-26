"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwnedProject } from "@/lib/projects/ownership";
import countries from "@/lib/fusion/countries.json";

const projectIdSchema=z.string().uuid();
const countryCodeSchema=z.string().regex(/^[A-Z]{2}$/);
const text=(form:FormData,key:string)=>String(form.get(key)??"");
const relationTypes=[
 "GENERAL_RELEVANCE","REPORTED_TARGET","REPORTED_LOCATION","REPORTED_ORIGIN",
 "REPORTED_VICTIM_LOCATION","REPORTED_OPERATIONAL_AREA","MENTIONED_IN_SOURCE","OTHER"
] as const;
const targetTables={
 SOURCE:"sources",SOURCE_ASSET:"source_assets",SOURCE_NOTE:"source_notes",
 ANNOTATION:"source_annotations",SOURCE_CLAIM:"source_claims",ATTRIBUTION_CLAIM:"source_attribution_claims",
 ACTOR:"threat_actors",CAMPAIGN:"campaigns",INDICATOR:"indicators",MALWARE:"malware",
 CVE:"cves",MITRE:"mitre_techniques",TIMELINE_EVENT:"timeline_events",
 RESEARCH_NOTE:"research_notes",EVIDENCE:"evidence",COUNTRY_NOTE:"investigation_country_notes"
} as const;
async function context(form:FormData){
 const projectId=projectIdSchema.parse(text(form,"projectId"));
 return {projectId,...await requireOwnedProject(projectId)};
}
async function ensureCountry(ctx:Awaited<ReturnType<typeof context>>, iso2:string){
 countryCodeSchema.parse(iso2);
 if(!countries.some(c=>c.iso2===iso2)) throw Error("Unknown country");
 const check=()=>ctx.supabase.from("investigation_countries").select("id").eq("project_id",ctx.projectId)
  .eq("country_iso2",iso2).maybeSingle();
 const found=await check();
 if(found.error) throw Error("Country records could not be read");
 if(found.data) return found.data.id;
 const created=await ctx.supabase.from("investigation_countries").insert({
  project_id:ctx.projectId,country_iso2:iso2,created_by:ctx.user.id
 }).select("id").single();
 if(created.data) return created.data.id;
 if(created.error?.code==="23505"){
  const retry=await check();
  if(retry.data) return retry.data.id;
 }
 throw Error("Country could not be activated in this investigation");
}
function refresh(projectId:string){revalidatePath(`/projects/${projectId}/fusion`);}
export async function createCountryNote(form:FormData){
 const ctx=await context(form);
 const iso2=countryCodeSchema.parse(text(form,"country"));
 const title=z.string().trim().min(1).max(180).parse(text(form,"title"));
 const body=z.string().max(50000).parse(text(form,"body"));
 const countryId=await ensureCountry(ctx,iso2);
 const {error}=await ctx.supabase.from("investigation_country_notes").insert({
  project_id:ctx.projectId,investigation_country_id:countryId,title,body,created_by:ctx.user.id
 });
 if(error) throw Error("Country note could not be saved");
 refresh(ctx.projectId);
}
export async function updateCountryNote(form:FormData){
 const ctx=await context(form);
 const noteId=z.string().uuid().parse(text(form,"noteId"));
 const title=z.string().trim().min(1).max(180).parse(text(form,"title"));
 const body=z.string().max(50000).parse(text(form,"body"));
 const {data,error}=await ctx.supabase.from("investigation_country_notes")
  .update({title,body}).eq("project_id",ctx.projectId).eq("id",noteId).select("id").single();
 if(error||!data) throw Error("Note update failed or access denied");
 refresh(ctx.projectId);
}
export async function deleteCountryNote(form:FormData){
 const ctx=await context(form);
 const noteId=z.string().uuid().parse(text(form,"noteId"));
 const {data,error}=await ctx.supabase.from("investigation_country_notes")
  .delete().eq("project_id",ctx.projectId).eq("id",noteId).select("id").single();
 if(error||!data) throw Error("Country note deletion failed or access denied");
 refresh(ctx.projectId);
}
export async function linkCountryRecord(form:FormData){
 const recordKey=text(form,"recordKey");
 if(recordKey) {
  const sep=recordKey.indexOf(":");
  if(sep<1) throw Error("Invalid record selection");
  const repaired=new FormData();
  for(const [key,value] of form.entries()) if(key!=="recordKey") repaired.append(key,value);
  repaired.set("targetType",recordKey.slice(0,sep));
  repaired.set("targetId",recordKey.slice(sep+1));
  form=repaired;
 }
 const ctx=await context(form);
 const iso2=countryCodeSchema.parse(text(form,"country"));
 const targetType=z.enum(Object.keys(targetTables) as [keyof typeof targetTables,...(keyof typeof targetTables)[]])
  .parse(text(form,"targetType"));
 const targetId=z.string().uuid().parse(text(form,"targetId"));
 const relationType=z.enum(relationTypes).parse(text(form,"relationType"));
 const rationale=z.string().max(4000).parse(text(form,"rationale")||"");
 // Defense-in-depth: app-level membership check and database trigger both validate target ownership.
 const check=await ctx.supabase.from(targetTables[targetType]).select("id").eq("project_id",ctx.projectId).eq("id",targetId).maybeSingle();
 if(check.error||!check.data) throw Error("Linked record not found in this investigation");
 const countryId=await ensureCountry(ctx,iso2);
 const {error}=await ctx.supabase.from("investigation_country_links").insert({
  project_id:ctx.projectId,investigation_country_id:countryId,
  target_type:targetType,target_id:targetId,relation_type:relationType,
  rationale:rationale||null,created_by:ctx.user.id
 });
 if(error) throw Error(error.code==="23505"?"Country association already exists":"Unable to link record to country");
 refresh(ctx.projectId);
}
export async function unlinkCountryRecord(form:FormData){
 const ctx=await context(form);
 const id=z.string().uuid().parse(text(form,"linkId"));
 const {data,error}=await ctx.supabase.from("investigation_country_links").delete()
  .eq("project_id",ctx.projectId).eq("id",id).select("id").single();
 if(error||!data) throw Error("Cannot remove country association");
 refresh(ctx.projectId);
}
export async function attachExistingEvidence(form:FormData){
 const ctx=await context(form);
 const evidenceId=z.string().uuid().parse(text(form,"evidenceId"));
 const country=countryCodeSchema.parse(text(form,"country"));
 const noteId=text(form,"noteId");
 const description=z.string().max(2000).parse(text(form,"description"));
 const {data:evidence,error:evidenceError}=await ctx.supabase.from("evidence").select("id")
  .eq("project_id",ctx.projectId).eq("id",evidenceId).maybeSingle();
 if(evidenceError||!evidence) throw Error("Evidence does not belong to this investigation");
 const countryId=await ensureCountry(ctx,country);
 if(noteId) {
  z.string().uuid().parse(noteId);
  const {data:note,error:noteError}=await ctx.supabase.from("investigation_country_notes")
   .select("id,investigation_country_id").eq("project_id",ctx.projectId)
   .eq("id",noteId).maybeSingle();
  if(noteError||!note||note.investigation_country_id!==countryId)throw Error("Country note not found");
 }
 const {error}=await ctx.supabase.from("fusion_attachment_links").insert({
  project_id:ctx.projectId,evidence_id:evidenceId,
  investigation_country_id:noteId?null:countryId,country_note_id:noteId||null,
  description:description||null,created_by:ctx.user.id
 });
 if(error) throw Error(error.code==="23505"?"Evidence already attached here":"Could not link existing evidence");
 refresh(ctx.projectId);
}
export async function detachExistingEvidence(form:FormData){
 const ctx=await context(form);const id=z.string().uuid().parse(text(form,"attachmentLinkId"));
 const {data,error}=await ctx.supabase.from("fusion_attachment_links").delete()
  .eq("project_id",ctx.projectId).eq("id",id).select("id").single();
 if(error||!data) throw Error("Could not remove evidence association");
 refresh(ctx.projectId);
}

export async function setSourceReviewStatus(form:FormData){
 const ctx=await context(form);
 const sourceId=z.string().uuid().parse(text(form,"sourceId"));
 const reviewStatus=z.enum(["NOT_REVIEWED","IN_PROGRESS","REVIEWED","NEEDS_REVIEW"]).parse(text(form,"reviewStatus"));
 const {data,error}=await ctx.supabase.from("sources").update({
  review_status:reviewStatus,
  reviewed_at:reviewStatus==="REVIEWED"?new Date().toISOString():null,
  reviewed_by:reviewStatus==="REVIEWED"?ctx.user.id:null
 }).eq("project_id",ctx.projectId).eq("id",sourceId).select("id").single();
 if(error||!data)throw Error("Unable to update source review status");
 revalidatePath(`/projects/${ctx.projectId}/sources`);
 refresh(ctx.projectId);
}
