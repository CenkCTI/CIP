import type { SupabaseClient } from "@supabase/supabase-js";
export async function listStandaloneIntelProfiles(supabase:SupabaseClient){return supabase.from("intel_profiles").select("*, intel_profile_items(count)").eq("kind","STANDALONE").order("updated_at",{ascending:false});}
export async function listInvestigationIntelProfiles(supabase:SupabaseClient){return supabase.from("intel_profiles").select("*, projects(name), intel_profile_items(count)").eq("kind","INVESTIGATION").order("updated_at",{ascending:false});}
export async function getIntelProfile(supabase:SupabaseClient,id:string){return supabase.from("intel_profiles").select("*, projects(name)").eq("id",id).maybeSingle();}
export async function getInvestigationIntelProfile(supabase:SupabaseClient,projectId:string){return supabase.from("intel_profiles").select("*, projects(name)").eq("kind","INVESTIGATION").eq("project_id",projectId).maybeSingle();}
export async function listIntelProfileItems(supabase:SupabaseClient,profileId:string){return supabase.from("intel_profile_items").select("*").eq("profile_id",profileId).order("updated_at",{ascending:false});}
export async function listIntelProfileAudit(supabase:SupabaseClient,profileId:string){return supabase.from("intel_profile_audit_events").select("*").eq("profile_id",profileId).order("created_at",{ascending:false}).limit(50);}
