"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createVersionSchema,idSchema,metadataSchema } from "@/lib/reports/versioning";
const fail=()=>({error:"Unable to complete this report operation."});
async function owned(projectId:string,reportId:string){
 const ids=idSchema.safeParse(projectId), rid=idSchema.safeParse(reportId); if(!ids.success||!rid.success)return null;
 const {supabase,user}=await requireUser(); const {data:p}=await supabase.from("projects").select("id,owner_id").eq("id",projectId).single(); if(!p||p.owner_id!==user.id)return null;
 const {data:r}=await supabase.from("reports").select("*").eq("project_id",projectId).eq("id",reportId).single(); return r?{supabase,user,report:r}:null;
}
export async function updateProductMetadata(projectId:string,reportId:string,_:unknown,fd:FormData){
 const ctx=await owned(projectId,reportId); const input=metadataSchema.safeParse({productType:fd.get("productType"),lifecycleStatus:fd.get("lifecycleStatus")}); if(!ctx||!input.success)return fail();
 if(input.data.lifecycleStatus==="PUBLISHED"&&!ctx.report.authoritative_version_id)return {error:"Publish a saved version before selecting PUBLISHED."};
 if(input.data.lifecycleStatus==="SUPERSEDED"&&!ctx.report.authoritative_version_id)return {error:"A superseded product requires a published replacement."};
 const stamp=input.data.lifecycleStatus==="ARCHIVED"?{archived_at:new Date().toISOString()}:input.data.lifecycleStatus===ctx.report.lifecycle_status?{}:{archived_at:null};
 const {error}=await ctx.supabase.from("reports").update({product_type:input.data.productType,lifecycle_status:input.data.lifecycleStatus,...stamp}).eq("project_id",projectId).eq("id",reportId); if(error)return fail();
 revalidatePath(`/projects/${projectId}/reports/${reportId}`); return {success:"Product metadata saved."};
}
export async function createReportVersion(projectId:string,reportId:string,_:unknown,fd:FormData){
 const ctx=await owned(projectId,reportId); const input=createVersionSchema.safeParse(Object.fromEntries(fd)); if(!ctx||!input.success)return {error:"Complete every assessment field within its allowed length."};
 const row={project_id:projectId,report_id:reportId,version_number:Number(ctx.report.current_version_number??0)+1,title_snapshot:ctx.report.title,product_type_snapshot:ctx.report.product_type,content_snapshot:ctx.report.content,executive_summary_snapshot:input.data.executiveSummary,key_judgments_snapshot:input.data.keyJudgments,confidence_snapshot:input.data.confidence,intelligence_gaps_snapshot:input.data.intelligenceGaps,recommendations_snapshot:input.data.recommendations,change_summary:input.data.changeSummary,created_by:ctx.user.id};
 const {data:v,error}=await ctx.supabase.from("report_versions").insert(row).select("id").single(); if(error||!v)return fail();
 const {data:refs,error:refError}=await ctx.supabase.from("report_references").select("*").eq("project_id",projectId).eq("report_id",reportId); if(refError)return fail();
 const columns:Record<string,string>={SOURCE:"source_id",EVIDENCE:"evidence_id",INDICATOR:"indicator_id",ENRICHMENT_RESULT:"enrichment_result_id",INFRASTRUCTURE_CLUSTER:"infrastructure_cluster_id",TIMELINE_EVENT:"timeline_event_id",CAMPAIGN:"campaign_id",THREAT_ACTOR:"threat_actor_id",MALWARE:"malware_id",CVE:"cve_id",MITRE_TECHNIQUE:"mitre_technique_id",ATTRIBUTION_HYPOTHESIS:"attribution_hypothesis_id",ATTRIBUTION_ASSESSMENT:"attribution_assessment_id"};
 if(refs?.length){const snapshots=refs.map((r)=>({project_id:projectId,report_id:reportId,report_version_id:v.id,reference_type:r.reference_type,[columns[r.reference_type]]:r.reference_id,label_snapshot:r.label,state_snapshot:{state:r.state},source_updated_at:r.source_updated_at,created_by:ctx.user.id})); const {error:e}=await ctx.supabase.from("report_version_references").insert(snapshots);if(e)return fail();}
 revalidatePath(`/projects/${projectId}/reports/${reportId}`); return {success:`Version ${row.version_number} created. It has not been published.`};
}
export async function publishReportVersion(projectId:string,reportId:string,versionId:string){
 const ctx=await owned(projectId,reportId); if(!ctx||!idSchema.safeParse(versionId).success)return fail();
 const {data:v}=await ctx.supabase.from("report_versions").select("id,version_status").eq("project_id",projectId).eq("report_id",reportId).eq("id",versionId).single(); if(!v||v.version_status!=="SAVED")return fail();
 const {error}=await ctx.supabase.rpc("publish_report_version",{p_project_id:projectId,p_report_id:reportId,p_version_id:versionId});if(error)return fail();
 revalidatePath(`/projects/${projectId}/reports/${reportId}`);return {success:"Version published as the authoritative intelligence record."};
}
