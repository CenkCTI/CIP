"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  setTechnicalSignalProfileMatchLifecycleWorkflow,
  unsnoozeTechnicalSignalProfileMatchWorkflow,
} from "@/lib/techint/intelligence/trusted-client";
import { technicalProfileMatchLifecycleSchema, type TechnicalProfileMatchLifecycle } from "@/lib/techint/intelligence/schema";

const idSchema = z.uuid();

function refreshTechInt() {
  revalidatePath("/techint", "layout");
  revalidatePath("/projects", "layout");
}

export async function setTechnicalProfileMatchLifecycle(
  matchId: string,
  lifecycle: TechnicalProfileMatchLifecycle,
  snoozeHours: number | null,
  _formData?: FormData,
) {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(matchId).success || !technicalProfileMatchLifecycleSchema.safeParse(lifecycle).success) {
      return { error: "The profile match action is invalid." };
    }
    let snoozedUntil: string | null = null;
    if (lifecycle === "SNOOZED") {
      if (!Number.isInteger(snoozeHours) || snoozeHours == null || snoozeHours < 1 || snoozeHours > 24 * 90) {
        return { error: "The snooze duration is invalid." };
      }
      snoozedUntil = new Date(Date.now() + snoozeHours * 60 * 60 * 1000).toISOString();
    }
    await setTechnicalSignalProfileMatchLifecycleWorkflow({
      p_actor: user.id,
      p_match_id: matchId,
      p_lifecycle: lifecycle,
      p_snoozed_until: snoozedUntil,
    });
    refreshTechInt();
    return { success: "Profile match state updated." };
  } catch {
    return { error: "The profile match state could not be changed safely." };
  }
}

export async function unsnoozeTechnicalProfileMatch(matchId: string, _formData?: FormData) {
  try {
    const { user } = await requireUser();
    if (!idSchema.safeParse(matchId).success) return { error: "The profile match action is invalid." };
    await unsnoozeTechnicalSignalProfileMatchWorkflow({ p_actor: user.id, p_match_id: matchId });
    refreshTechInt();
    return { success: "Profile match unsnoozed." };
  } catch {
    return { error: "The profile match could not be unsnoozed safely." };
  }
}
