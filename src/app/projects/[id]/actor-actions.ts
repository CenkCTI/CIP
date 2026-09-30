"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { actorSchema } from "@/lib/cti-schema";
import { requiredUuidSchema } from "@/lib/workspace/schema";

export type ActorActionState = {
  error?: string;
  success?: string;
};

const relationDefs = {
  malware: {
    table: "threat_actor_malware",
    relatedTable: "malware",
    relatedColumn: "malware_id",
  },
  indicator: {
    table: "threat_actor_indicators",
    relatedTable: "indicators",
    relatedColumn: "indicator_id",
  },
  mitre: {
    table: "threat_actor_mitre_techniques",
    relatedTable: "mitre_techniques",
    relatedColumn: "mitre_technique_id",
  },
} as const;

export type ActorRelationshipType = keyof typeof relationDefs;

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function actorContext(projectId: string, actorId?: string) {
  const project = requiredUuidSchema.safeParse(projectId);
  if (!project.success) return null;
  const context = await requireUser();
  const { data: ownedProject } = await context.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", project.data)
    .maybeSingle();
  if (!ownedProject || ownedProject.owner_id !== context.user.id) return null;

  if (!actorId) return { ...context, projectId: project.data };

  const actor = requiredUuidSchema.safeParse(actorId);
  if (!actor.success) return null;
  const { data: ownedActor } = await context.supabase
    .from("threat_actors")
    .select("id,known_ttps,references")
    .eq("project_id", project.data)
    .eq("id", actor.data)
    .maybeSingle();
  if (!ownedActor) return null;

  return {
    ...context,
    projectId: project.data,
    actorId: actor.data,
    actor: ownedActor,
  };
}

function refresh(projectId: string, actorId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (actorId) revalidatePath(`/projects/${projectId}/actors/${actorId}`);
}

export async function createActorProfile(
  projectId: string,
  formData: FormData,
): Promise<ActorActionState> {
  const context = await actorContext(projectId);
  if (!context) return { error: "Investigation not found." };

  const parsed = actorSchema.safeParse({
    ...formObject(formData),
    known_ttps: "",
    references: "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Threat Actor profile." };
  }

  const { error } = await context.supabase.from("threat_actors").insert({
    ...parsed.data,
    project_id: context.projectId,
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A Threat Actor with this name already exists in this Investigation."
          : "Unable to create Threat Actor.",
    };
  }

  refresh(context.projectId);
  return { success: "Threat Actor created." };
}

export async function updateActorProfile(
  projectId: string,
  actorId: string,
  formData: FormData,
): Promise<ActorActionState> {
  const context = await actorContext(projectId, actorId);
  if (!context || !("actorId" in context)) return { error: "Threat Actor not found." };

  const parsed = actorSchema.safeParse({
    ...formObject(formData),
    known_ttps: context.actor.known_ttps ?? "",
    references: Array.isArray(context.actor.references)
      ? context.actor.references.join(", ")
      : "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid Threat Actor profile." };
  }

  const { error } = await context.supabase
    .from("threat_actors")
    .update(parsed.data)
    .eq("project_id", context.projectId)
    .eq("id", context.actorId);
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "A Threat Actor with this name already exists in this Investigation."
          : "Unable to update Threat Actor.",
    };
  }

  refresh(context.projectId, context.actorId);
  return { success: "Threat Actor profile updated." };
}

export async function linkActorRelationship(
  projectId: string,
  actorId: string,
  relationshipType: ActorRelationshipType,
  relatedId: string,
): Promise<ActorActionState> {
  const context = await actorContext(projectId, actorId);
  if (!context || !("actorId" in context)) return { error: "Threat Actor not found." };

  const definition = relationDefs[relationshipType];
  if (!definition) return { error: "Unsupported relationship type." };
  const related = requiredUuidSchema.safeParse(relatedId);
  if (!related.success) return { error: "Select a valid record." };

  const { data: relatedRecord, error: relatedError } = await context.supabase
    .from(definition.relatedTable)
    .select("id")
    .eq("project_id", context.projectId)
    .eq("id", related.data)
    .maybeSingle();
  if (relatedError || !relatedRecord) {
    return { error: "The selected record is not available in this Investigation." };
  }

  const { error } = await context.supabase.from(definition.table).insert({
    project_id: context.projectId,
    threat_actor_id: context.actorId,
    [definition.relatedColumn]: related.data,
  });
  if (error && error.code !== "23505") {
    return { error: "Unable to link the selected record." };
  }

  refresh(context.projectId, context.actorId);
  return { success: "Record linked." };
}

export async function unlinkActorRelationship(
  projectId: string,
  actorId: string,
  relationshipType: ActorRelationshipType,
  relatedId: string,
): Promise<ActorActionState> {
  const context = await actorContext(projectId, actorId);
  if (!context || !("actorId" in context)) return { error: "Threat Actor not found." };

  const definition = relationDefs[relationshipType];
  if (!definition) return { error: "Unsupported relationship type." };
  const related = requiredUuidSchema.safeParse(relatedId);
  if (!related.success) return { error: "Linked record not found." };

  const { error } = await context.supabase
    .from(definition.table)
    .delete()
    .eq("project_id", context.projectId)
    .eq("threat_actor_id", context.actorId)
    .eq(definition.relatedColumn, related.data);
  if (error) return { error: "Unable to unlink the selected record." };

  refresh(context.projectId, context.actorId);
  return { success: "Record unlinked." };
}
