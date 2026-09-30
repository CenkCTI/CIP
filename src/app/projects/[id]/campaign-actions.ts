"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { campaignSchema } from "@/lib/cti-schema";
import { requiredUuidSchema } from "@/lib/workspace/schema";

export type CampaignActionState = {
  error?: string;
  success?: string;
};

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function campaignContext(projectId: string, campaignId?: string) {
  const project = requiredUuidSchema.safeParse(projectId);
  if (!project.success) return null;

  const context = await requireUser();
  const { data: ownedProject } = await context.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", project.data)
    .maybeSingle();
  if (!ownedProject || ownedProject.owner_id !== context.user.id) return null;

  if (!campaignId) return { ...context, projectId: project.data };

  const campaign = requiredUuidSchema.safeParse(campaignId);
  if (!campaign.success) return null;
  const { data: ownedCampaign } = await context.supabase
    .from("campaigns")
    .select("id")
    .eq("project_id", project.data)
    .eq("id", campaign.data)
    .maybeSingle();
  if (!ownedCampaign) return null;

  return {
    ...context,
    projectId: project.data,
    campaignId: campaign.data,
  };
}

function refresh(projectId: string, campaignId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (campaignId) revalidatePath(`/projects/${projectId}/campaigns/${campaignId}`);
}

export async function createCampaignProfile(
  projectId: string,
  formData: FormData,
): Promise<CampaignActionState> {
  const context = await campaignContext(projectId);
  if (!context) return { error: "Investigation not found." };

  const parsed = campaignSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Campaign profile." };
  }

  const { error } = await context.supabase.from("campaigns").insert({
    ...parsed.data,
    project_id: context.projectId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A Campaign with this name already exists in this Investigation."
          : "Unable to create Campaign.",
    };
  }

  refresh(context.projectId);
  return { success: "Campaign created." };
}

export async function updateCampaignProfile(
  projectId: string,
  campaignId: string,
  formData: FormData,
): Promise<CampaignActionState> {
  const context = await campaignContext(projectId, campaignId);
  if (!context || !("campaignId" in context)) return { error: "Campaign not found." };

  const parsed = campaignSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Campaign profile." };
  }

  const { error } = await context.supabase
    .from("campaigns")
    .update(parsed.data)
    .eq("project_id", context.projectId)
    .eq("id", context.campaignId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A Campaign with this name already exists in this Investigation."
          : "Unable to update Campaign.",
    };
  }

  refresh(context.projectId, context.campaignId);
  return { success: "Campaign profile updated." };
}
