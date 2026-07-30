"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createVersionSchema,idSchema,metadataSchema,referenceInputSchema } from "@/lib/reports/versioning";
const fail=()=>({error:"Unable to complete this report operation."});
async function owned(projectId:string,reportId:string){
 const ids=idSchema.safeParse(projectId), rid=idSchema.safeParse(reportId); if(!ids.success||!rid.success)return null;
 const {supabase,user}=await requireUser(); const {data:p}=await supabase.from("projects").select("id,owner_id").eq("id",projectId).single(); if(!p||p.owner_id!==user.id)return null;
 const {data:r}=await supabase.from("reports").select("*").eq("project_id",projectId).eq("id",reportId).single(); return r?{supabase,user,report:r}:null;
}
export async function updateProductMetadata(projectId:string,reportId:string,_:unknown,fd:FormData){
 const ctx=await owned(projectId,reportId); const input=metadataSchema.safeParse({productType:fd.get("productType"),lifecycleStatus:fd.get("lifecycleStatus")}); if(!ctx||!input.success)return fail();
 const stamp=input.data.lifecycleStatus==="ARCHIVED"?{archived_at:new Date().toISOString()}:input.data.lifecycleStatus===ctx.report.lifecycle_status?{}:{archived_at:null};
 const {error}=await ctx.supabase.from("reports").update({product_type:input.data.productType,lifecycle_status:input.data.lifecycleStatus,...stamp}).eq("project_id",projectId).eq("id",reportId); if(error)return fail();
 revalidatePath(`/projects/${projectId}/reports/${reportId}`); return {success:"Product metadata saved."};
}
export async function createReportVersion(projectId:string,reportId:string,_:unknown,fd:FormData){
 const ctx=await owned(projectId,reportId); const input=createVersionSchema.safeParse(Object.fromEntries(fd)); if(!ctx||!input.success)return {error:"Complete every assessment field within its allowed length."};
 const {data:v,error}=await ctx.supabase.rpc("create_report_version",{p_project_id:projectId,p_report_id:reportId,p_change_summary:input.data.changeSummary,p_executive_summary:input.data.executiveSummary,p_key_judgments:input.data.keyJudgments,p_confidence:input.data.confidence,p_intelligence_gaps:input.data.intelligenceGaps,p_recommendations:input.data.recommendations});
 if(error||!v)return fail(); revalidatePath(`/projects/${projectId}/reports/${reportId}`); return {success:`Version ${String((v as Record<string,unknown>).version_number)} created atomically. It has not been published.`};
}

const referenceColumns:Record<string,string>={SOURCE:"source_id",EVIDENCE:"evidence_id",INDICATOR:"indicator_id",ENRICHMENT_RESULT:"enrichment_result_id",INFRASTRUCTURE_CLUSTER:"infrastructure_cluster_id",TIMELINE_EVENT:"timeline_event_id",CAMPAIGN:"campaign_id",THREAT_ACTOR:"threat_actor_id",MALWARE:"malware_id",CVE:"cve_id",MITRE_TECHNIQUE:"mitre_technique_id",ATTRIBUTION_HYPOTHESIS:"attribution_hypothesis_id",ATTRIBUTION_ASSESSMENT:"attribution_assessment_id"};
export async function addReportReference(projectId:string,reportId:string,_:unknown,fd:FormData){const ctx=await owned(projectId,reportId);const p=referenceInputSchema.safeParse({referenceType:fd.get("referenceType"),targetId:fd.get("targetId")});if(!ctx||!p.success)return fail();const {error}=await ctx.supabase.from("report_references").insert({project_id:projectId,report_id:reportId,reference_type:p.data.referenceType,[referenceColumns[p.data.referenceType]]:p.data.targetId,created_by:ctx.user.id});if(error)return fail();revalidatePath(`/projects/${projectId}/reports/${reportId}`);return {success:"Analytical reference added."};}
export async function unlinkReportReference(projectId:string,reportId:string,referenceId:string){const ctx=await owned(projectId,reportId);if(!ctx||!idSchema.safeParse(referenceId).success)return fail();const {data,error}=await ctx.supabase.from("report_references").delete().eq("project_id",projectId).eq("report_id",reportId).eq("id",referenceId).select("id").single();if(error||!data)return fail();revalidatePath(`/projects/${projectId}/reports/${reportId}`);return {success:"Draft reference unlinked. Historical version snapshots were preserved."};}
export async function publishReportVersion(projectId:string,reportId:string,versionId:string){
 const ctx=await owned(projectId,reportId); if(!ctx||!idSchema.safeParse(versionId).success)return fail();
 const {data:v}=await ctx.supabase.from("report_versions").select("id,version_status").eq("project_id",projectId).eq("report_id",reportId).eq("id",versionId).single(); if(!v||v.version_status!=="SAVED")return fail();
 const {error}=await ctx.supabase.rpc("publish_report_version",{p_project_id:projectId,p_report_id:reportId,p_version_id:versionId});if(error)return fail();
 revalidatePath(`/projects/${projectId}/reports/${reportId}`);return {success:"Version published as the authoritative intelligence record."};
}
