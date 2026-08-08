"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  addAliasInputSchema,
  createEntityFromAssertionInputSchema,
  createEntityInputSchema,
  entityIdSchema,
  entityStatusSchema,
  linkAssertionInputSchema,
  reconcileEntitiesInputSchema,
} from "@/lib/techint/entities/schema";
import {
  addTechnicalEntityAliasWorkflow,
  createTechnicalEntityFromAssertionWorkflow,
  createTechnicalEntityWorkflow,
  dismissTechnicalEntityAssertionWorkflow,
  linkTechnicalEntityAssertionWorkflow,
  reconcileTechnicalEntitiesWorkflow,
  renameTechnicalEntityWorkflow,
  resetTechnicalEntityAssertionWorkflow,
  revokeTechnicalEntityAliasWorkflow,
  setTechnicalEntityStatusWorkflow,
} from "@/lib/techint/entities/trusted-client";

function refresh() {
  revalidatePath("/techint");
  revalidatePath("/techint/entities");
}

function checked(form: FormData, name: string) {
  return form.get(name) === "on" || form.get(name) === "true";
}

export async function reconcileTechnicalEntities(form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const parsed = reconcileEntitiesInputSchema.parse({ limit: form.get("limit") || 200 });
    await reconcileTechnicalEntitiesWorkflow({ p_actor: user.id, p_limit: parsed.limit });
    refresh();
  } catch {
    return;
  }
}

export async function createTechnicalEntity(form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const parsed = createEntityInputSchema.parse({
      kind: form.get("kind"),
      canonicalName: form.get("canonicalName"),
      indicatorType: form.get("indicatorType") || null,
    });
    await createTechnicalEntityWorkflow({
      p_actor: user.id,
      p_kind: parsed.kind,
      p_canonical_name: parsed.canonicalName,
      p_indicator_type: parsed.indicatorType ?? null,
    });
    refresh();
  } catch {
    return;
  }
}

export async function createEntityFromAssertion(assertionId: string, form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const parsed = createEntityFromAssertionInputSchema.parse({
      assertionId,
      canonicalName: form.get("canonicalName") || undefined,
      rememberAlias: checked(form, "rememberAlias"),
    });
    await createTechnicalEntityFromAssertionWorkflow({
      p_actor: user.id,
      p_assertion_id: parsed.assertionId,
      p_canonical_name: parsed.canonicalName || null,
      p_remember_alias: parsed.rememberAlias,
    });
    refresh();
  } catch {
    return;
  }
}

export async function linkEntityAssertion(assertionId: string, form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const parsed = linkAssertionInputSchema.parse({
      assertionId,
      entityId: form.get("entityId"),
      rememberAlias: checked(form, "rememberAlias"),
    });
    await linkTechnicalEntityAssertionWorkflow({
      p_actor: user.id,
      p_assertion_id: parsed.assertionId,
      p_entity_id: parsed.entityId,
      p_remember_alias: parsed.rememberAlias,
    });
    refresh();
  } catch {
    return;
  }
}

export async function addEntityAlias(entityId: string, form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const parsed = addAliasInputSchema.parse({
      entityId,
      displayValue: form.get("displayValue"),
      sourceAssertionId: form.get("sourceAssertionId") || null,
    });
    await addTechnicalEntityAliasWorkflow({
      p_actor: user.id,
      p_entity_id: parsed.entityId,
      p_display_value: parsed.displayValue,
      p_source_assertion_id: parsed.sourceAssertionId ?? null,
    });
    refresh();
  } catch {
    return;
  }
}

export async function revokeEntityAlias(aliasId: string): Promise<void> {
  try {
    const { user } = await requireUser();
    await revokeTechnicalEntityAliasWorkflow({ p_actor: user.id, p_alias_id: entityIdSchema.parse(aliasId) });
    refresh();
  } catch {
    return;
  }
}

export async function dismissEntityAssertion(assertionId: string): Promise<void> {
  try {
    const { user } = await requireUser();
    await dismissTechnicalEntityAssertionWorkflow({ p_actor: user.id, p_assertion_id: entityIdSchema.parse(assertionId) });
    refresh();
  } catch {
    return;
  }
}

export async function resetEntityAssertion(assertionId: string): Promise<void> {
  try {
    const { user } = await requireUser();
    await resetTechnicalEntityAssertionWorkflow({ p_actor: user.id, p_assertion_id: entityIdSchema.parse(assertionId) });
    refresh();
  } catch {
    return;
  }
}

export async function renameEntity(entityId: string, form: FormData): Promise<void> {
  try {
    const { user } = await requireUser();
    const canonicalName = String(form.get("canonicalName") ?? "").trim();
    if (!canonicalName || canonicalName.length > 500) return;
    await renameTechnicalEntityWorkflow({ p_actor: user.id, p_entity_id: entityIdSchema.parse(entityId), p_name: canonicalName });
    refresh();
  } catch {
    return;
  }
}

export async function setEntityStatus(entityId: string, status: "ACTIVE" | "ARCHIVED"): Promise<void> {
  try {
    const { user } = await requireUser();
    await setTechnicalEntityStatusWorkflow({
      p_actor: user.id,
      p_entity_id: entityIdSchema.parse(entityId),
      p_status: entityStatusSchema.parse(status),
    });
    refresh();
  } catch {
    return;
  }
}
