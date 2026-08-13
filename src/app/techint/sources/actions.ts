"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { authKeySchema } from "@/lib/ioc-connectors/credentials/schema";
import { encryptCredential } from "@/lib/ioc-connectors/credentials/crypto";
import { getProvider as getIocProvider } from "@/lib/ioc-connectors/registry";
import { ThreatFoxError } from "@/lib/ioc-connectors/providers/threatfox/errors";
import { configureThreatFoxConnection, disconnectThreatFoxCredential } from "@/lib/ioc-connectors/trusted-workflow-client";
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
  configureTechnicalCollectorWorkflow,
  enableTechnicalSourceWorkflow,
  setTechnicalSourceStatusWorkflow,
  updateTechnicalSourceSettingsWorkflow,
} from "@/lib/techint/collection/trusted-collection-client";
import { runClaimedTechnicalCollection } from "@/lib/techint/collection/orchestrator";
import { assertLegacyCollectionAllowed } from "@/lib/techint/collection/authority";

export type TechnicalSourceActionState = { success?: string; error?: string };
export type TechnicalCollectorActionState = { success?: string; error?: string; token?: string };

const collectorOperationSchema = z.enum(["ENABLE", "PAUSE", "ROTATE"]);
const collectorPollSchema = z.coerce.number().int().min(30).max(3600);

function refresh() {
  revalidatePath("/techint");
  revalidatePath("/techint/sources");
  revalidatePath("/techint/entities");
  revalidatePath("/techint/profiles", "layout");
  revalidatePath("/techint/investint", "layout");
  revalidatePath("/projects", "layout");
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

function safeThreatFoxCredentialError(error: unknown): string {
  if (!(error instanceof ThreatFoxError)) return "ThreatFox credential configuration failed safely.";
  if (["THREATFOX_AUTH_FAILED", "THREATFOX_CREDENTIAL_INVALID", "THREATFOX_CREDENTIAL_REQUIRED"].includes(error.code)) {
    return "ThreatFox rejected the Auth-Key. Verify the key and try again.";
  }
  if (error.code === "THREATFOX_RATE_LIMITED") return "ThreatFox rate-limited the credential test. Try again later.";
  if (error.code === "THREATFOX_TIMEOUT") return "ThreatFox did not respond before the bounded credential-test timeout.";
  return "ThreatFox could not validate the Auth-Key safely.";
}

export async function configureTechnicalCollector(
  _state: TechnicalCollectorActionState,
  form: FormData,
): Promise<TechnicalCollectorActionState> {
  try {
    const { user } = await requireUser();
    const operation = collectorOperationSchema.safeParse(form.get("operation"));
    const poll = collectorPollSchema.safeParse(form.get("poll_interval_seconds") ?? "60");
    if (!operation.success || !poll.success) {
      return { error: "Choose a collector poll interval between 30 and 3600 seconds." };
    }

    const enabled = operation.data !== "PAUSE";
    const configured = await configureTechnicalCollectorWorkflow({
      actorId: user.id,
      enabled,
      pollIntervalSeconds: poll.data,
      rotateToken: operation.data === "ROTATE",
      label: "Desktop collector",
    });
    refresh();

    if (operation.data === "PAUSE") {
      return { success: "Continuous collection paused. Source cursors and history were preserved." };
    }
    if (operation.data === "ROTATE") {
      return {
        success: "Collector token rotated. The previous desktop token is no longer valid.",
        token: configured.token ?? undefined,
      };
    }
    return {
      success: configured.token
        ? "Continuous collector enabled. Copy the one-time token into the local collector."
        : "Continuous collector enabled.",
      token: configured.token ?? undefined,
    };
  } catch {
    return { error: "Continuous collector settings could not be updated safely." };
  }
}

export async function configureThreatFoxCredential(
  _state: TechnicalSourceActionState,
  form: FormData,
): Promise<TechnicalSourceActionState> {
  try {
    const { user, supabase } = await requireUser();
    const credential = authKeySchema.safeParse(form.get("auth_key"));
    if (!credential.success) return { error: "Enter a valid ThreatFox Auth-Key." };

    const adapter = getIocProvider("THREATFOX");
    if (!adapter?.testConnection) return { error: "ThreatFox credential testing is unavailable on this server." };
    await adapter.testConnection(credential.data);

    const { data: existing } = await supabase
      .from("ioc_provider_connections")
      .select("id")
      .eq("owner_id", user.id)
      .eq("provider_key", "THREATFOX")
      .is("archived_at", null)
      .maybeSingle();
    const connectionId = existing?.id ?? randomUUID();
    const encrypted = encryptCredential(credential.data, {
      ownerId: user.id,
      connectionId,
      providerKey: "THREATFOX",
      keyVersion: 1,
    });
    const { error } = await configureThreatFoxConnection({
      p_owner_id: user.id,
      p_connection_id: connectionId,
      p_ciphertext_b64: encrypted.ciphertext_b64,
      p_iv_b64: encrypted.iv_b64,
      p_auth_tag_b64: encrypted.auth_tag_b64,
      p_key_version: encrypted.key_version,
      // The legacy IOC connection is retained only as the encrypted secret store.
      // Scheduling and lookback are owned by the TechINT source connection.
      p_lookback_days: 1,
      p_scheduler_enabled: false,
      p_sync_interval_minutes: 120,
    });
    if (error) return { error: "ThreatFox credential could not be stored safely." };
    refresh();
    return { success: existing?.id ? "ThreatFox Auth-Key tested and rotated." : "ThreatFox Auth-Key tested and configured." };
  } catch (error) {
    return { error: safeThreatFoxCredentialError(error) };
  }
}

export async function disconnectThreatFoxSourceCredential(
  _state: TechnicalSourceActionState,
  form: FormData,
): Promise<TechnicalSourceActionState> {
  try {
    const { user } = await requireUser();
    const parsed = connectionIdSchema.safeParse(form.get("credential_connection_id"));
    if (!parsed.success) return { error: "ThreatFox credential connection is unavailable." };
    const { error } = await disconnectThreatFoxCredential(user.id, parsed.data);
    if (error) return { error: "ThreatFox credential could not be disconnected safely." };
    refresh();
    return { success: "ThreatFox Auth-Key disconnected. Historical Technical Signals and provenance were preserved." };
  } catch {
    return { error: "ThreatFox credential could not be disconnected safely." };
  }
}

export async function enableTechnicalSource(form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const sourceKey = sourceKeySchema.parse(form.get("sourceKey"));
    assertLegacyCollectionAllowed(sourceKey);
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
