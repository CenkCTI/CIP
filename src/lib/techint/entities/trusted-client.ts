import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createEntityFromAssertionResultSchema,
  createEntityResultSchema,
  entityIdSchema,
  reconcileEntitiesResultSchema,
} from "./schema";

type Parameters = Record<string, unknown>;

function trustedClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("TechINT entity workflow is not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function rpc<T>(name: string, parameters: Parameters, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await trustedClient().rpc(name, parameters);
  if (error) throw new Error("TechINT entity workflow failed safely.");
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error("TechINT entity workflow returned an invalid result.");
  return parsed.data;
}

export const reconcileTechnicalEntitiesWorkflow = (parameters: Parameters) =>
  rpc("reconcile_technical_entity_assertions", parameters, reconcileEntitiesResultSchema);

export const createTechnicalEntityWorkflow = (parameters: Parameters) =>
  rpc("create_technical_entity", parameters, createEntityResultSchema);

export const createTechnicalEntityFromAssertionWorkflow = (parameters: Parameters) =>
  rpc("create_technical_entity_from_assertion", parameters, createEntityFromAssertionResultSchema);

export const linkTechnicalEntityAssertionWorkflow = (parameters: Parameters) =>
  rpc("link_technical_entity_assertion", parameters, entityIdSchema);

export const addTechnicalEntityAliasWorkflow = (parameters: Parameters) =>
  rpc("add_technical_entity_alias", parameters, entityIdSchema);

export const revokeTechnicalEntityAliasWorkflow = (parameters: Parameters) =>
  rpc("revoke_technical_entity_alias", parameters, entityIdSchema);

export const dismissTechnicalEntityAssertionWorkflow = (parameters: Parameters) =>
  rpc("dismiss_technical_entity_assertion", parameters, entityIdSchema);

export const resetTechnicalEntityAssertionWorkflow = (parameters: Parameters) =>
  rpc("reset_technical_entity_assertion_review", parameters, entityIdSchema);

export const renameTechnicalEntityWorkflow = (parameters: Parameters) =>
  rpc("rename_technical_entity", parameters, entityIdSchema);

export const setTechnicalEntityStatusWorkflow = (parameters: Parameters) =>
  rpc("set_technical_entity_status", parameters, entityIdSchema);
