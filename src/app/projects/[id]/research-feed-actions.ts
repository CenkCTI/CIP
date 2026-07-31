"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireOwnedProject } from "@/lib/projects/ownership";
import { ingestStoredResearchFeed } from "@/lib/research-feeds/orchestrator";
import { editFeedFormSchema, feedFormSchema, idsSchema } from "@/lib/research-feeds/schema";
import { archiveFeedWorkflow, createFeedWorkflow, editFeedWorkflow, restoreFeedWorkflow, setFeedEnabledWorkflow } from "@/lib/research-feeds/trusted-workflow-client";
import { normalizeFeedUrl } from "@/lib/research-feeds/url";

export type FeedActionState = { error?: string; success?: string };
const refresh = (id: string) => revalidatePath(`/projects/${id}`);
const hashUrl = (value: string) => createHash("sha256").update(value).digest("hex");

function safeRpcError(message = "") {
  if (message.includes("FETCH_ALREADY_RUNNING")) return "A fetch is already in progress.";
  if (message.includes("FEED_LIMIT")) return "This Investigation has reached the 100-feed limit.";
  if (message.includes("FEED_ARCHIVED")) return "Archived feeds must be restored before editing.";
  return "The feed change could not be saved.";
}

export async function createResearchFeed(projectId: string, _state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  try {
    const context = await requireOwnedProject(projectId);
    const parsed = feedFormSchema.safeParse({ name: formData.get("name"), description: formData.get("description") ?? "", configured_url: formData.get("configured_url"), enabled: formData.get("enabled") === "on" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const configuredUrl = normalizeFeedUrl(parsed.data.configured_url).toString();
    const { error } = await createFeedWorkflow( { p_actor_id: context.user.id, p_project_id: projectId, p_name: parsed.data.name, p_description: parsed.data.description, p_configured_url: configuredUrl, p_configured_url_hash: hashUrl(configuredUrl), p_enabled: parsed.data.enabled });
    if (error) return { error: safeRpcError(error.message) };
    refresh(projectId);
    return { success: "Feed created. It will not fetch until Fetch now is selected." };
  } catch { return { error: "Investigation not found." }; }
}

export async function updateResearchFeed(projectId: string, feedId: string, _state: FeedActionState, formData: FormData): Promise<FeedActionState> {
  try {
    if (!idsSchema.safeParse({ projectId, feedId }).success) return { error: "Feed not found." };
    const context = await requireOwnedProject(projectId);
    const parsed = editFeedFormSchema.safeParse({ name: formData.get("name"), description: formData.get("description") ?? "", configured_url: formData.get("configured_url"), enabled: formData.get("enabled") === "on" });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const configuredUrl = parsed.data.configured_url ? normalizeFeedUrl(parsed.data.configured_url).toString() : null;
    const { error } = await editFeedWorkflow( { p_actor_id: context.user.id, p_project_id: projectId, p_feed_source_id: feedId, p_name: parsed.data.name, p_description: parsed.data.description, p_configured_url: configuredUrl, p_configured_url_hash: configuredUrl ? hashUrl(configuredUrl) : null, p_enabled: parsed.data.enabled });
    if (error) return { error: safeRpcError(error.message) };
    refresh(projectId);
    return { success: "Feed updated." };
  } catch { return { error: "Investigation not found." }; }
}

export async function setResearchFeedEnabled(projectId: string, feedId: string, enabled: boolean) {
  try {
    const context = await requireOwnedProject(projectId);
    const { error } = await setFeedEnabledWorkflow( { p_actor_id: context.user.id, p_project_id: projectId, p_feed_source_id: feedId, p_enabled: enabled });
    if (error) return { error: "Feed state could not be changed." };
    refresh(projectId); return { success: enabled ? "Feed enabled." : "Feed paused." };
  } catch { return { error: "Feed not found." }; }
}

export async function archiveResearchFeed(projectId: string, feedId: string) {
  try {
    const context = await requireOwnedProject(projectId);
    const { error } = await archiveFeedWorkflow( { p_actor_id: context.user.id, p_project_id: projectId, p_feed_source_id: feedId });
    if (error) return { error: safeRpcError(error.message) };
    refresh(projectId); return { success: "Feed archived; collected items and history were preserved." };
  } catch { return { error: "Feed not found." }; }
}

export async function restoreResearchFeed(projectId: string, feedId: string) {
  try {
    const context = await requireOwnedProject(projectId);
    const { error } = await restoreFeedWorkflow( { p_actor_id: context.user.id, p_project_id: projectId, p_feed_source_id: feedId });
    if (error) return { error: "Feed could not be restored." };
    refresh(projectId); return { success: "Feed restored in a paused state." };
  } catch { return { error: "Feed not found." }; }
}

export async function fetchResearchFeedNow(projectId: string, feedId: string) {
  if (!idsSchema.safeParse({ projectId, feedId }).success) return { error: "Feed not found." };
  const result = await ingestStoredResearchFeed(projectId, feedId); refresh(projectId); return result;
}
