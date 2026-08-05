"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { idSchema, itemInputSchema, profileDefinitionSchema } from "@/lib/techint/schema";
import {
  addExplicitItemWorkflow,
  createInvestigationProfileWorkflow,
  createStandaloneProfileWorkflow,
  refreshInvestigationProfileWorkflow,
  setProfileStatusWorkflow,
  transitionItemWorkflow,
  updateProfileDefinitionWorkflow,
} from "@/lib/techint/trusted-workflow-client";

export type IntelActionResult = { success?: string; error?: string };

const safe = (
  message = "The Intel Profile change could not be completed safely.",
): IntelActionResult => ({ error: message });

function refresh(projectId?: string | null) {
  revalidatePath("/techint");
  revalidatePath("/techint/profiles");
  revalidatePath("/techint/investint");
  if (projectId) revalidatePath(`/projects/${projectId}/intel-profile`);
}

function definitionParameters(actorId: string, form: FormData) {
  const parsed = profileDefinitionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message } as const;
  return {
    data: {
      p_actor: actorId,
      p_name: parsed.data.name,
      p_description: parsed.data.description,
      p_intelligence_question: parsed.data.intelligence_question,
      p_priority: parsed.data.priority,
      p_time_horizon_days: parsed.data.time_horizon_days,
      p_minimum_confidence: parsed.data.minimum_confidence,
      p_relationship_depth: parsed.data.relationship_depth,
    },
  } as const;
}

function isDuplicateInvestigationProfile(code?: string) {
  return code === "23505";
}

export async function createStandaloneIntelProfile(
  form: FormData,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    const parsed = definitionParameters(user.id, form);
    if ("error" in parsed) return { error: parsed.error };
    const { error } = await createStandaloneProfileWorkflow(parsed.data);
    if (error) return safe();
    refresh();
    return { success: "Standalone TechINT profile created." };
  } catch {
    return safe();
  }
}

export async function createInvestigationIntelProfile(
  projectId: string,
  form: FormData,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(projectId).success) return safe();
    const parsed = definitionParameters(user.id, form);
    if ("error" in parsed) return { error: parsed.error };
    const { error } = await createInvestigationProfileWorkflow({
      ...parsed.data,
      p_project_id: projectId,
    });
    if (error) {
      return safe(
        isDuplicateInvestigationProfile(error.code)
          ? "This Investigation already has a non-archived Intel Profile."
          : undefined,
      );
    }
    refresh(projectId);
    return { success: "Investigation Intel Profile created." };
  } catch {
    return safe();
  }
}

export async function updateIntelProfile(
  profileId: string,
  form: FormData,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(profileId).success) return safe();
    const parsed = definitionParameters(user.id, form);
    if ("error" in parsed) return { error: parsed.error };
    const { data: projectId, error } = await updateProfileDefinitionWorkflow({
      ...parsed.data,
      p_profile_id: profileId,
    });
    if (error) return safe();
    refresh(projectId);
    return { success: "Intel Profile saved." };
  } catch {
    return safe();
  }
}

export async function setIntelProfileStatus(
  profileId: string,
  status: "ACTIVE" | "PAUSED" | "ARCHIVED",
  restore = false,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(profileId).success) return safe();
    const { data: projectId, error } = await setProfileStatusWorkflow({
      p_actor: user.id,
      p_profile_id: profileId,
      p_status: status,
      p_restore: restore,
    });
    if (error) return safe();
    refresh(projectId);
    return {
      success: restore
        ? "Intel Profile restored in a paused state."
        : `Intel Profile ${status.toLowerCase()}.`,
    };
  } catch {
    return safe();
  }
}

export async function addIntelProfileItem(
  profileId: string,
  form: FormData,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    const parsed = itemInputSchema.safeParse({
      profileId,
      kind: form.get("kind"),
      displayValue: form.get("display_value"),
      semanticRole: form.get("semantic_role") || null,
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const { error } = await addExplicitItemWorkflow({
      p_actor: user.id,
      p_profile_id: profileId,
      p_kind: parsed.data.kind,
      p_display_value: parsed.data.displayValue,
      p_semantic_role: parsed.data.semanticRole ?? null,
    });
    if (error) {
      return safe(
        error.code === "23505"
          ? "This item identity already exists in the profile. Reactivate excluded or removed items explicitly."
          : error.message.includes("LOCATION_ROLE_REQUIRED")
            ? "Location items require a semantic role before activation."
            : undefined,
      );
    }
    refresh();
    return { success: "Profile item added." };
  } catch {
    return safe();
  }
}

export async function setIntelProfileItemState(
  profileId: string,
  itemId: string,
  state: "ACTIVE" | "EXCLUDED" | "REMOVED",
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(profileId).success || !idSchema.safeParse(itemId).success) {
      return safe();
    }
    const { data: projectId, error } = await transitionItemWorkflow({
      p_actor: user.id,
      p_profile_id: profileId,
      p_item_id: itemId,
      p_target_state: state,
    });
    if (error) return safe("That item state transition is not allowed.");
    refresh(projectId);
    return { success: "Item state updated." };
  } catch {
    return safe();
  }
}

export async function refreshInvestigationIntelProfile(
  profileId: string,
  projectId: string,
): Promise<IntelActionResult> {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(profileId).success || !idSchema.safeParse(projectId).success) {
      return safe();
    }
    const { data, error } = await refreshInvestigationProfileWorkflow({
      p_actor: user.id,
      p_profile_id: profileId,
      p_project_id: projectId,
    });
    if (error || !data) return safe();
    refresh(projectId);
    return {
      success: `Refresh complete: ${data.added} added, ${data.already_present} already present, ${data.preserved_exclusions} exclusions preserved, ${data.preserved_removals} removals preserved, ${data.skipped} skipped.`,
    };
  } catch {
    return safe();
  }
}
