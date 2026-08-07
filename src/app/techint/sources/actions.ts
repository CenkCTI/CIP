"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { connectionIdSchema, sourceKeySchema, sourceSettingsInputSchema, sourceStatusSchema } from "@/lib/techint/collection/schema";
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

export async function enableTechnicalSource(form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const sourceKey = sourceKeySchema.parse(form.get("sourceKey"));
    const adapter = getTechnicalSourceAdapter(sourceKey);
    const parsed = sourceSettingsInputSchema.safeParse({
      sourceKey,
      intervalMinutes: form.get("intervalMinutes") ?? adapter.metadata.defaultIntervalMinutes,
      initialLookbackHours: form.get("initialLookbackHours") || undefined,
    });
    if (!parsed.success) return;
    const settings = sourceKey === "NVD_CVE" ? { initialLookbackHours: parsed.data.initialLookbackHours ?? 24 } : {};
    await enableTechnicalSourceWorkflow({
      actorId: user.id,
      sourceKey,
      settings,
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
    const parsed = sourceSettingsInputSchema.safeParse({
      sourceKey: key,
      intervalMinutes: form.get("intervalMinutes"),
      initialLookbackHours: form.get("initialLookbackHours") || undefined,
    });
    if (!parsed.success) return;
    await updateTechnicalSourceSettingsWorkflow({
      actorId: user.id,
      connectionId: id,
      intervalMinutes: parsed.data.intervalMinutes,
      settings: key === "NVD_CVE" ? { initialLookbackHours: parsed.data.initialLookbackHours ?? 24 } : {},
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
