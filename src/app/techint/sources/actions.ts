"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  connectionIdSchema,
  sourceKeySchema,
  sourceSettingsInputSchema,
  sourceStatusSchema,
  technicalSourceSettingsObject,
} from "@/lib/techint/collection/schema";
import { getTechnicalSourceAdapter } from "@/lib/techint/collection/registry";
import {
  claimManualTechnicalCollection,
  enableTechnicalSourceWorkflow,
  setTechnicalSourceStatusWorkflow,
  updateTechnicalSourceSettingsWorkflow,
} from "@/lib/techint/collection/trusted-collection-client";
import { runClaimedTechnicalCollection } from "@/lib/techint/collection/orchestrator";

function refresh() {
  revalidatePath("/techint");
  revalidatePath("/techint/sources");
}

function settingsInput(sourceKey: string, intervalMinutes: FormDataEntryValue | null, form: FormData) {
  return {
    sourceKey,
    intervalMinutes,
    initialLookbackHours: form.get("initialLookbackHours") || undefined,
    minimumEpss: form.get("minimumEpss") || undefined,
    lookbackDays: form.get("lookbackDays") || undefined,
  };
}

export async function enableTechnicalSource(form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const sourceKey = sourceKeySchema.parse(form.get("sourceKey"));
    const adapter = getTechnicalSourceAdapter(sourceKey);
    const parsed = sourceSettingsInputSchema.safeParse(
      settingsInput(sourceKey, form.get("intervalMinutes") ?? String(adapter.metadata.defaultIntervalMinutes), form),
    );
    if (!parsed.success) return;
    await enableTechnicalSourceWorkflow({
      actorId: user.id,
      sourceKey,
      settings: technicalSourceSettingsObject(parsed.data),
      intervalMinutes: parsed.data.intervalMinutes,
    });
    refresh();
  } catch {
    return;
  }
}

export async function setTechnicalSourceStatus(
  connectionId: string,
  status: "ENABLED" | "PAUSED" | "ARCHIVED",
): Promise<void> {
  try {
    const { user } = await requireUser();
    const id = connectionIdSchema.parse(connectionId);
    const parsedStatus = sourceStatusSchema.parse(status);
    await setTechnicalSourceStatusWorkflow({ actorId: user.id, connectionId: id, status: parsedStatus });
    refresh();
  } catch {
    return;
  }
}

export async function updateTechnicalSourceSettings(
  connectionId: string,
  sourceKey: string,
  form: FormData,
): Promise<void> {
  try {
    const { user } = await requireUser();
    const id = connectionIdSchema.parse(connectionId);
    const key = sourceKeySchema.parse(sourceKey);
    const parsed = sourceSettingsInputSchema.safeParse(settingsInput(key, form.get("intervalMinutes"), form));
    if (!parsed.success) return;
    await updateTechnicalSourceSettingsWorkflow({
      actorId: user.id,
      connectionId: id,
      intervalMinutes: parsed.data.intervalMinutes,
      settings: technicalSourceSettingsObject(parsed.data),
    });
    refresh();
  } catch {
    return;
  }
}

export async function syncTechnicalSourceNow(connectionId: string): Promise<void> {
  try {
    const { user } = await requireUser();
    const id = connectionIdSchema.parse(connectionId);
    const claim = await claimManualTechnicalCollection({ actorId: user.id, connectionId: id, trigger: "MANUAL" });
    const result = await runClaimedTechnicalCollection(claim);
    refresh();
    void result;
  } catch {
    return;
  }
}
