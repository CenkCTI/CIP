"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseProjectForm } from "@/lib/projects/schema";
import { requireUser } from "@/lib/auth";
import { timelineDeletionMessage } from "@/lib/reconstruction/presentation";
import {
  reportMetaSchema,
  reportSchema,
  formObject as reportFormObject,
  emptyTiptapDoc,
} from "@/lib/reports/schema";
import {
  buildEvidencePath,
  evidenceFinalizeSchema,
  evidenceFileMetadataSchema,
  evidenceMetadataSchema,
  evidenceReplacementSchema,
  evidenceUrlOnlySchema,
  formObject,
  noteSchema,
  requiredUuidSchema,
  taskSchema,
  timelineSchema,
  uploadAuthorizeSchema,
  validateUpload,
} from "@/lib/workspace/schema";

type State = {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
};
type UploadAuthState = State & {
  path?: string;
  token?: string;
  metadata?: unknown;
};
function safeReturn(path: string | null) {
  return path?.startsWith("/") && !path.startsWith("//") ? path : "/dashboard";
}
function authenticationError(
  operation:
    | "sign in"
    | "sign up"
    | "send a password reset link"
    | "update the password",
  error: { message?: string; status?: number },
) {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("invalid login credentials")) {
    return "The email or password is incorrect.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email address before signing in.";
  }
  if (
    message.includes("already registered") ||
    message.includes("already exists")
  ) {
    return "An account with this email already exists.";
  }
  if (error.status === 429 || message.includes("rate limit")) {
    return "Too many authentication attempts. Please wait and try again.";
  }
  return `Unable to ${operation}. Please try again.`;
}
export async function signIn(_: State, formData: FormData): Promise<State> {
  const s = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const { error } = await s.auth.signInWithPassword({ email, password });
  if (error) return { error: authenticationError("sign in", error) };
  redirect(safeReturn(String(formData.get("returnTo") || "/dashboard")));
}
export async function signUp(_: State, formData: FormData): Promise<State> {
  const s = await createClient();
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const display_name = String(formData.get("display_name") || "");
  const { error } = await s.auth.signUp({
    email,
    password,
    options: { data: { display_name } },
  });
  if (error) return { error: authenticationError("sign up", error) };
  return { success: "Check your email to confirm your account, then sign in." };
}
export async function signOut() {
  const s = await createClient();
  await s.auth.signOut();
  redirect("/auth/sign-in");
}
export async function forgotPassword(
  _: State,
  formData: FormData,
): Promise<State> {
  const s = await createClient();
  const email = String(formData.get("email") || "");
  const { error } = await s.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/update-password`,
  });
  if (error)
    return { error: authenticationError("send a password reset link", error) };
  return {
    success:
      "If email recovery is enabled in Supabase, a reset link has been sent.",
  };
}
export async function updatePassword(
  _: State,
  formData: FormData,
): Promise<State> {
  const s = await createClient();
  const password = String(formData.get("password") || "");
  if (password.length < 8)
    return { error: "Password must be at least 8 characters." };
  const { error } = await s.auth.updateUser({ password });
  if (error)
    return { error: authenticationError("update the password", error) };
  return { success: "Password updated. You can continue to the dashboard." };
}
export async function createProject(
  _: State,
  formData: FormData,
): Promise<State> {
  const { supabase, user } = await requireUser();
  const parsed = parseProjectForm(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid project" };
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();
  if (error)
    return {
      error:
        error.code === "23505"
          ? "A project with this name already exists."
          : error.message,
    };
  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}
export async function updateProject(
  id: string,
  _: State,
  formData: FormData,
): Promise<State> {
  const { supabase } = await requireUser();
  const parsed = parseProjectForm(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid project" };
  const { error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { success: "Project updated." };
}
export async function deleteProject(
  id: string,
  name: string,
  formData: FormData,
) {
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== name) return;
  const { supabase } = await requireUser();
  await supabase.from("projects").delete().eq("id", id);
  revalidatePath("/projects");
  redirect("/projects");
}

function parseRequiredUuid(
  value: string,
  label: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const parsed = requiredUuidSchema.safeParse(value);
  return parsed.success
    ? { ok: true, id: parsed.data }
    : { ok: false, error: `${label} is required.` };
}
async function assertProject(projectId: string) {
  const parsed = parseRequiredUuid(projectId, "Project");
  if (!parsed.ok) throw new Error(parsed.error);
  const ctx = await requireUser();
  const { data, error } = await ctx.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", parsed.id)
    .single();
  if (error || !data || data.owner_id !== ctx.user.id)
    throw new Error("Project not found");
  return { ...ctx, projectId: parsed.id };
}
async function assertChild(
  projectId: string,
  table: "research_notes" | "evidence" | "timeline_events" | "project_tasks",
  id: string,
) {
  const child = parseRequiredUuid(id, "Record");
  if (!child.ok) throw new Error(child.error);
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const { data, error } = await supabase
    .from(table)
    .select("id,project_id")
    .eq("project_id", pid)
    .eq("id", child.id)
    .single();
  if (error || !data) throw new Error("Record not found");
  return { supabase, user, projectId: pid, id: child.id };
}
const msg = (p: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => p.error?.issues[0]?.message ?? "Invalid input";
const evidencePersistenceError = (error: { code?: string } | null) =>
  error?.code === "23514"
    ? "This evidence type requires either a valid source URL or an uploaded file."
    : "Evidence could not be saved. Please verify the evidence details and try again.";

export async function createNote(
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const p = noteSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from("research_notes")
    .insert({ ...p.data, project_id: pid, author_id: user.id });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${pid}`);
  return { success: "Note created." };
}
export async function updateNote(
  projectId: string,
  id: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "research_notes", id);
  const p = noteSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from("research_notes")
    .update(p.data)
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${pid}`);
  return { success: "Note updated." };
}
export async function deleteNote(projectId: string, id: string) {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "research_notes", id);
  await supabase
    .from("research_notes")
    .delete()
    .eq("project_id", pid)
    .eq("id", childId);
  revalidatePath(`/projects/${pid}`);
}

export async function createUrlEvidence(
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const p = evidenceUrlOnlySchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from("evidence")
    .insert({ ...p.data, project_id: pid, collected_by: user.id });
  if (error) return { error: evidencePersistenceError(error) };
  revalidatePath(`/projects/${pid}`);
  return { success: "Evidence saved." };
}
export async function authorizeEvidenceUpload(
  projectId: string,
  input: unknown,
): Promise<UploadAuthState> {
  const project = parseRequiredUuid(projectId, "Project");
  if (!project.ok) return { error: project.error };
  const { supabase, user } = await assertProject(project.id);
  const p = uploadAuthorizeSchema.safeParse(input);
  if (!p.success) return { error: msg(p) };
  const bad = validateUpload({
    name: p.data.file_name,
    type: p.data.mime_type,
    size: p.data.file_size,
  });
  if (bad) return { error: bad };
  const storage_path = buildEvidencePath(user.id, project.id, p.data.file_name);
  const { data, error } = await supabase.storage
    .from("evidence")
    .createSignedUploadUrl(storage_path);
  if (error)
    return { error: `Signed upload authorization failed: ${error.message}` };
  if (!data?.token)
    return {
      error:
        "Signed upload authorization failed: Supabase did not return an upload token.",
    };
  return {
    success: "Signed upload authorized.",
    path: storage_path,
    token: data.token,
    metadata: p.data,
  };
}
export async function finalizeEvidenceUpload(
  projectId: string,
  input: unknown,
): Promise<State> {
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const p = evidenceFinalizeSchema.safeParse(input);
  if (!p.success) {
    const path =
      typeof input === "object" && input && "storage_path" in input
        ? String(input.storage_path)
        : null;
    if (path) await supabase.storage.from("evidence").remove([path]);
    return { error: msg(p) };
  }
  if (!p.data.storage_path.startsWith(`${user.id}/${pid}/`)) {
    await supabase.storage.from("evidence").remove([p.data.storage_path]);
    return { error: "Invalid evidence path." };
  }
  const { error } = await supabase
    .from("evidence")
    .insert({ ...p.data, project_id: pid, collected_by: user.id });
  if (error) {
    await supabase.storage.from("evidence").remove([p.data.storage_path]);
    return { error: evidencePersistenceError(error) };
  }
  revalidatePath(`/projects/${pid}`);
  return { success: "Evidence saved." };
}
export async function updateEvidence(
  projectId: string,
  id: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "evidence", id);
  const raw = formObject(fd);
  const metadata = evidenceMetadataSchema.safeParse(raw);
  if (!metadata.success) return { error: msg(metadata) };
  const { data: existing, error: readError } = await supabase
    .from("evidence")
    .select("storage_path,source_url")
    .eq("project_id", pid)
    .eq("id", childId)
    .maybeSingle();
  if (readError || !existing) return { error: "Evidence not found." };
  const p = existing.storage_path
    ? evidenceFileMetadataSchema.safeParse(raw)
    : evidenceUrlOnlySchema.safeParse(raw);
  if (!p.success)
    return {
      error: existing.storage_path
        ? "Uploaded evidence must keep a file-backed evidence type."
        : msg(p),
    };
  const { error } = await supabase
    .from("evidence")
    .update(p.data)
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) return { error: evidencePersistenceError(error) };
  revalidatePath(`/projects/${pid}`);
  return { success: "Evidence updated." };
}
export async function replaceEvidenceFile(
  projectId: string,
  id: string,
  input: unknown,
): Promise<State> {
  const {
    supabase,
    user,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "evidence", id);
  const p = evidenceReplacementSchema.safeParse(input);
  if (!p.success) return { error: msg(p) };
  if (!p.data.storage_path.startsWith(`${user.id}/${pid}/`)) {
    await supabase.storage.from("evidence").remove([p.data.storage_path]);
    return { error: "Invalid evidence path." };
  }
  const { data: old } = await supabase
    .from("evidence")
    .select("storage_path")
    .eq("project_id", pid)
    .eq("id", childId)
    .single();
  const { error } = await supabase
    .from("evidence")
    .update(p.data)
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) {
    await supabase.storage.from("evidence").remove([p.data.storage_path]);
    return { error: error.message };
  }
  if (old?.storage_path)
    await supabase.storage.from("evidence").remove([old.storage_path]);
  revalidatePath(`/projects/${pid}`);
  return { success: "Evidence file replaced." };
}
export async function getEvidenceDownloadUrl(projectId: string, id: string) {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "evidence", id);
  const { data: ev, error } = await supabase
    .from("evidence")
    .select("storage_path,source_url")
    .eq("project_id", pid)
    .eq("id", childId)
    .single();
  if (error || !ev) return { error: "Evidence not found." };
  if (ev.source_url && !ev.storage_path) return { url: ev.source_url };
  const { data, error: signError } = await supabase.storage
    .from("evidence")
    .createSignedUrl(String(ev.storage_path), 60);
  if (signError) return { error: signError.message };
  return { url: data.signedUrl };
}
export async function deleteEvidence(projectId: string, id: string) {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "evidence", id);
  const { data } = await supabase
    .from("evidence")
    .select("storage_path")
    .eq("project_id", pid)
    .eq("id", childId)
    .single();
  await supabase
    .from("evidence")
    .delete()
    .eq("project_id", pid)
    .eq("id", childId);
  if (data?.storage_path)
    await supabase.storage.from("evidence").remove([data.storage_path]);
  revalidatePath(`/projects/${pid}`);
}

export async function createTimelineEvent(
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, projectId: pid } = await assertProject(projectId);
  const p = timelineSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from("timeline_events")
    .insert({ ...p.data, project_id: pid });
  if (error) return { error: "Unable to save Timeline event." };
  revalidatePath(`/projects/${pid}`);
  return { success: "Event created." };
}
export async function updateTimelineEvent(
  projectId: string,
  id: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "timeline_events", id);
  const p = timelineSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from("timeline_events")
    .update(p.data)
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) return { error: "Unable to save Timeline event." };
  revalidatePath(`/projects/${pid}`);
  return { success: "Event updated." };
}
export async function deleteTimelineEvent(
  projectId: string,
  id: string,
  state?: State,
) {
  void state;
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "timeline_events", id);
  const { data: memberships, error: membershipError } = await supabase
    .from("campaign_timeline_events")
    .select("status")
    .eq("project_id", pid)
    .eq("timeline_event_id", childId);
  if (membershipError) {
    return { error: "Unable to verify Campaign memberships." };
  }
  const deletionBlock = timelineDeletionMessage(
    memberships?.map((membership) => membership.status) ?? [],
  );
  if (deletionBlock) return { error: deletionBlock };
  const { error } = await supabase
    .from("timeline_events")
    .delete()
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) return { error: "Unable to delete Timeline event." };
  revalidatePath(`/projects/${pid}`);
  return { success: "Timeline event deleted." };
}

export async function createTask(
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const p = taskSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const assigned_user_id = p.data.assigned_user_id ?? user.id;
  if (assigned_user_id !== user.id)
    return {
      error: "Tasks can only be assigned to the project owner in Phase 2.",
    };
  const { error } = await supabase
    .from("project_tasks")
    .insert({ ...p.data, assigned_user_id, project_id: pid });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${pid}`);
  return { success: "Task created." };
}
export async function updateTask(
  projectId: string,
  id: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const {
    supabase,
    user,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "project_tasks", id);
  const p = taskSchema.safeParse(formObject(fd));
  if (!p.success) return { error: msg(p) };
  const assigned_user_id = p.data.assigned_user_id ?? user.id;
  if (assigned_user_id !== user.id)
    return {
      error: "Tasks can only be assigned to the project owner in Phase 2.",
    };
  const { error } = await supabase
    .from("project_tasks")
    .update({ ...p.data, assigned_user_id })
    .eq("project_id", pid)
    .eq("id", childId);
  if (error) return { error: error.message };
  revalidatePath(`/projects/${pid}`);
  return { success: "Task updated." };
}
export async function updateTaskStatus(
  projectId: string,
  id: string,
  status: "TODO" | "IN_PROGRESS" | "COMPLETED",
) {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "project_tasks", id);
  await supabase
    .from("project_tasks")
    .update({ status })
    .eq("project_id", pid)
    .eq("id", childId);
  revalidatePath(`/projects/${pid}`);
}
export async function deleteTask(projectId: string, id: string) {
  const {
    supabase,
    projectId: pid,
    id: childId,
  } = await assertChild(projectId, "project_tasks", id);
  await supabase
    .from("project_tasks")
    .delete()
    .eq("project_id", pid)
    .eq("id", childId);
  revalidatePath(`/projects/${pid}`);
}

import {
  ctiTabs,
  entityTables,
  formObj,
  parseRelationshipSelections,
  buildRelationshipRpcPayload,
  schemas,
} from "@/lib/cti-schema";
type CtiTab = (typeof ctiTabs)[number];
const ctiTable = (tab: CtiTab) => entityTables[tab];
const relationMap = {
  actors: {
    malware_ids: ["threat_actor_malware", "threat_actor_id", "malware_id"],
    indicator_ids: [
      "threat_actor_indicators",
      "threat_actor_id",
      "indicator_id",
    ],
    mitre_technique_ids: [
      "threat_actor_mitre_techniques",
      "threat_actor_id",
      "mitre_technique_id",
    ],
  },
  campaigns: {
    threat_actor_ids: [
      "campaign_threat_actors",
      "campaign_id",
      "threat_actor_id",
    ],
    malware_ids: ["campaign_malware", "campaign_id", "malware_id"],
    indicator_ids: ["campaign_indicators", "campaign_id", "indicator_id"],
    mitre_technique_ids: [
      "campaign_mitre_techniques",
      "campaign_id",
      "mitre_technique_id",
    ],
  },
  malware: {
    threat_actor_ids: ["threat_actor_malware", "malware_id", "threat_actor_id"],
    campaign_ids: ["campaign_malware", "malware_id", "campaign_id"],
    indicator_ids: ["malware_indicators", "malware_id", "indicator_id"],
    cve_ids: ["cve_malware", "malware_id", "cve_id"],
    mitre_technique_ids: [
      "malware_mitre_techniques",
      "malware_id",
      "mitre_technique_id",
    ],
  },
  indicators: {
    threat_actor_ids: [
      "threat_actor_indicators",
      "indicator_id",
      "threat_actor_id",
    ],
    campaign_ids: ["campaign_indicators", "indicator_id", "campaign_id"],
    malware_ids: ["malware_indicators", "indicator_id", "malware_id"],
  },
  cves: { malware_ids: ["cve_malware", "cve_id", "malware_id"] },
  mitre: {
    threat_actor_ids: [
      "threat_actor_mitre_techniques",
      "mitre_technique_id",
      "threat_actor_id",
    ],
    campaign_ids: [
      "campaign_mitre_techniques",
      "mitre_technique_id",
      "campaign_id",
    ],
    malware_ids: [
      "malware_mitre_techniques",
      "mitre_technique_id",
      "malware_id",
    ],
  },
} as const;
const relatedTable = {
  threat_actor_ids: "threat_actors",
  campaign_ids: "campaigns",
  indicator_ids: "indicators",
  malware_ids: "malware",
  cve_ids: "cves",
  mitre_technique_ids: "mitre_techniques",
} as const;
async function assertCti(projectId: string, tab: CtiTab, id: string) {
  const { supabase, projectId: pid } = await assertProject(projectId);
  const child = parseRequiredUuid(id, "Record");
  if (!child.ok) throw new Error(child.error);
  const { data, error } = await supabase
    .from(ctiTable(tab))
    .select("id,project_id")
    .eq("project_id", pid)
    .eq("id", child.id)
    .single();
  if (error || !data) throw new Error("Record not found");
  return { supabase, projectId: pid, id: child.id };
}
async function syncRelationships(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  tab: CtiTab,
  id: string,
  fd: FormData,
) {
  const parsed = parseRelationshipSelections(fd);
  if (!parsed.success) return parsed.error;
  const defs = relationMap[tab] as Record<
    string,
    readonly [string, string, string]
  >;
  for (const key of Object.keys(defs) as Array<keyof typeof parsed.data>) {
    const desired = parsed.data[key];
    if (desired.length) {
      const { count, error } = await supabase
        .from(relatedTable[key])
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .in("id", desired);
      if (error || count !== desired.length)
        return "One or more related records could not be linked.";
    }
  }
  const { data, error } = await supabase.rpc("replace_cti_relationships", {
    p_project_id: projectId,
    p_entity_id: id,
    ...buildRelationshipRpcPayload(tab, parsed.data),
  });
  if (error) return "Relationships could not be updated.";
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok)
    return result?.error ?? "Relationships could not be updated.";
}
export async function createCti(
  tab: CtiTab,
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, projectId: pid } = await assertProject(projectId);
  const schema = schemas[tab];
  const p = schema.safeParse(formObj(fd));
  if (!p.success) return { error: msg(p) };
  const { data, error } = await supabase
    .from(ctiTable(tab))
    .insert({ ...p.data, project_id: pid })
    .select("id")
    .single();
  if (error)
    return {
      error:
        error.code === "23505"
          ? "A matching record already exists in this project."
          : error.message,
    };
  const relErr = await syncRelationships(supabase, pid, tab, data.id, fd);
  if (relErr) return { error: relErr };
  revalidatePath(`/projects/${pid}`);
  return { success: "CTI record created." };
}
export async function updateCti(
  tab: CtiTab,
  projectId: string,
  id: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const {
    supabase,
    projectId: pid,
    id: cid,
  } = await assertCti(projectId, tab, id);
  const p = schemas[tab].safeParse(formObj(fd));
  if (!p.success) return { error: msg(p) };
  const { error } = await supabase
    .from(ctiTable(tab))
    .update(p.data)
    .eq("project_id", pid)
    .eq("id", cid);
  if (error)
    return {
      error:
        error.code === "23505"
          ? "A matching record already exists in this project."
          : error.message,
    };
  const relErr = await syncRelationships(supabase, pid, tab, cid, fd);
  if (relErr) return { error: relErr };
  revalidatePath(`/projects/${pid}`);
  return { success: "CTI record updated." };
}
export async function deleteCti(
  tab: CtiTab,
  projectId: string,
  id: string,
  name: string,
  fd: FormData,
): Promise<State> {
  if (String(fd.get("confirm") || "") !== name)
    return { error: "Type the record name/value to confirm deletion." };
  const {
    supabase,
    projectId: pid,
    id: cid,
  } = await assertCti(projectId, tab, id);
  const { error } = await supabase
    .from(ctiTable(tab))
    .delete()
    .eq("project_id", pid)
    .eq("id", cid);
  if (error) return { error: "Record could not be deleted." };
  revalidatePath(`/projects/${pid}`);
  return { success: "CTI record deleted." };
}

async function assertReport(projectId: string, reportId: string) {
  const { supabase, projectId: pid } = await assertProject(projectId);
  const report = parseRequiredUuid(reportId, "Report");
  if (!report.ok) return { ok: false as const, error: "Report not found." };
  const { data, error } = await supabase
    .from("reports")
    .select("id,project_id,title")
    .eq("project_id", pid)
    .eq("id", report.id)
    .single();
  if (error || !data) return { ok: false as const, error: "Report not found." };
  return {
    ok: true as const,
    supabase,
    projectId: pid,
    reportId: report.id,
    title: String(data.title),
  };
}

export async function createReport(
  projectId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const { supabase, user, projectId: pid } = await assertProject(projectId);
  const p = reportMetaSchema.safeParse(reportFormObject(fd));
  if (!p.success)
    return { error: p.error.issues[0]?.message ?? "Invalid report" };
  const { data, error } = await supabase
    .from("reports")
    .insert({
      ...p.data,
      content: emptyTiptapDoc,
      project_id: pid,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Unable to create report." };
  revalidatePath(`/projects/${pid}`);
  redirect(`/projects/${pid}/reports/${data.id}`);
}
export async function updateReport(
  projectId: string,
  reportId: string,
  _: State,
  fd: FormData,
): Promise<State> {
  const report = await assertReport(projectId, reportId);
  if (!report.ok) return { error: report.error };
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(String(fd.get("content") || "null"));
  } catch {
    return { error: "Report content must be valid JSON." };
  }
  const p = reportSchema.safeParse({
    ...reportFormObject(fd),
    content: parsedContent,
  });
  if (!p.success)
    return { error: p.error.issues[0]?.message ?? "Invalid report" };
  const { data, error } = await report.supabase
    .from("reports")
    .update(p.data)
    .eq("project_id", report.projectId)
    .eq("id", report.reportId)
    .select("id")
    .single();
  if (error || !data) return { error: "Unable to save report." };
  revalidatePath(`/projects/${report.projectId}`);
  revalidatePath(`/projects/${report.projectId}/reports/${report.reportId}`);
  return { success: "Report saved." };
}
export async function deleteReport(
  projectId: string,
  reportId: string,
  _title: string,
  fd: FormData,
): Promise<State> {
  const report = await assertReport(projectId, reportId);
  if (!report.ok) return { error: report.error };
  if (String(fd.get("confirm") || "") !== report.title)
    return { error: "Confirmation does not match the current report title." };
  const { count: versionCount, error: versionCountError } = await report.supabase
    .from("report_versions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", report.projectId)
    .eq("report_id", report.reportId);
  if (versionCountError) return { error: "Unable to verify Report history." };
  if ((versionCount ?? 0) > 0)
    return { error: "Reports with permanent version history cannot be deleted. Archive this Report instead." };
  const { data: rels } = await report.supabase
    .from("entity_relationships")
    .select("id", { count: "exact" })
    .eq("project_id", report.projectId)
    .or(
      `and(source_type.eq.REPORT,source_id.eq.${report.reportId}),and(target_type.eq.REPORT,target_id.eq.${report.reportId})`,
    );
  const { data, error } = await report.supabase
    .from("reports")
    .delete()
    .eq("project_id", report.projectId)
    .eq("id", report.reportId)
    .select("id")
    .single();
  if (error || !data) return { error: "Unable to delete report." };
  revalidatePath(`/projects/${report.projectId}`);
  redirect(
    `/projects/${report.projectId}?tab=reports&deleted=report&relationships=${rels?.length ?? 0}`,
  );
}
