"use server";

import { revalidatePath } from "next/cache";

import {
  informationGapCreateSchema,
  informationGapUpdateSchema,
  investigationDecisionContextSchema,
  investigationLifecycleSchema,
  investigationRequirementSchema,
  investigationScopeSchema,
  orderedRecordSchema,
  recordIdSchema,
  supportingQuestionCreateSchema,
  supportingQuestionUpdateSchema,
  workingKnowledgeCreateSchema,
  workingKnowledgeSupportSchema,
  workingKnowledgeUpdateSchema,
} from "@/lib/investigations/direction-schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

type DirectionActionState = {
  success?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

type OrderedTable =
  | "investigation_questions"
  | "investigation_information_gaps"
  | "investigation_working_knowledge";

function invalid(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): DirectionActionState {
  const fieldErrors = error.flatten().fieldErrors;
  const first = Object.values(fieldErrors).flat()[0];
  return { error: first ?? "Invalid input.", fieldErrors };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

async function nextSortOrder(
  table: OrderedTable,
  projectId: string,
  supabase: Awaited<ReturnType<typeof requireOwnedProject>>["supabase"],
) {
  const { data } = await supabase
    .from(table)
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.sort_order ?? -10) + 10;
}

async function moveOrderedRecord(
  table: OrderedTable,
  projectId: string,
  recordId: string,
  direction: "UP" | "DOWN",
  supabase: Awaited<ReturnType<typeof requireOwnedProject>>["supabase"],
) {
  const { data, error } = await supabase
    .from(table)
    .select("id,sort_order,created_at")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return { error: error.message };

  const rows = data ?? [];
  const index = rows.findIndex((row) => row.id === recordId);
  if (index < 0) return { error: "Record not found." };
  const target = direction === "UP" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return { success: "Order unchanged." };

  const ids = rows.map((row) => row.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  for (let position = 0; position < ids.length; position += 1) {
    const { error: updateError } = await supabase
      .from(table)
      .update({ sort_order: position * 10 })
      .eq("project_id", projectId)
      .eq("id", ids[position]);
    if (updateError) return { error: updateError.message };
  }

  refresh(projectId);
  return { success: "Order updated." };
}

export async function updateInvestigationRequirement(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = investigationRequirementSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", pid);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Intelligence requirement updated." };
}

export async function updateInvestigationDecisionContext(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = investigationDecisionContextSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", pid);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Decision context updated." };
}

export async function updateInvestigationScope(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = investigationScopeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", pid);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Scope updated." };
}

export async function updateInvestigationLifecycle(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = investigationLifecycleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", pid);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Investigation lifecycle updated." };
}

export async function createSupportingQuestion(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = supportingQuestionCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, user, projectId: pid } = await requireOwnedProject(projectId);
  const sort_order = await nextSortOrder("investigation_questions", pid, supabase);
  const { error } = await supabase.from("investigation_questions").insert({
    project_id: pid,
    question: parsed.data.question,
    sort_order,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Supporting question added." };
}

export async function updateSupportingQuestion(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = supportingQuestionUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { id, ...changes } = parsed.data;
  const { error } = await supabase
    .from("investigation_questions")
    .update(changes)
    .eq("project_id", pid)
    .eq("id", id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Supporting question updated." };
}

export async function deleteSupportingQuestion(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = recordIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("investigation_questions")
    .delete()
    .eq("project_id", pid)
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Supporting question deleted." };
}

export async function moveSupportingQuestion(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = orderedRecordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  return moveOrderedRecord(
    "investigation_questions",
    pid,
    parsed.data.id,
    parsed.data.direction,
    supabase,
  );
}

export async function createInformationGap(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = informationGapCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, user, projectId: pid } = await requireOwnedProject(projectId);
  const sort_order = await nextSortOrder(
    "investigation_information_gaps",
    pid,
    supabase,
  );
  const { error } = await supabase.from("investigation_information_gaps").insert({
    project_id: pid,
    description: parsed.data.description,
    sort_order,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Information gap added." };
}

export async function updateInformationGap(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = informationGapUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { id, status, description } = parsed.data;
  const { error } = await supabase
    .from("investigation_information_gaps")
    .update({
      description,
      status,
      resolved_at: status === "RESOLVED" ? new Date().toISOString() : null,
    })
    .eq("project_id", pid)
    .eq("id", id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Information gap updated." };
}

export async function deleteInformationGap(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = recordIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("investigation_information_gaps")
    .delete()
    .eq("project_id", pid)
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Information gap deleted." };
}

export async function moveInformationGap(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = orderedRecordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  return moveOrderedRecord(
    "investigation_information_gaps",
    pid,
    parsed.data.id,
    parsed.data.direction,
    supabase,
  );
}

export async function createWorkingKnowledge(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = workingKnowledgeCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, user, projectId: pid } = await requireOwnedProject(projectId);
  const sort_order = await nextSortOrder(
    "investigation_working_knowledge",
    pid,
    supabase,
  );
  const { error } = await supabase.from("investigation_working_knowledge").insert({
    project_id: pid,
    statement: parsed.data.statement,
    sort_order,
    created_by: user.id,
  });
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Working knowledge added." };
}

export async function updateWorkingKnowledge(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = workingKnowledgeUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { id, ...changes } = parsed.data;
  const { error } = await supabase
    .from("investigation_working_knowledge")
    .update(changes)
    .eq("project_id", pid)
    .eq("id", id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Working knowledge updated." };
}

export async function withdrawWorkingKnowledge(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = recordIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("investigation_working_knowledge")
    .update({ state: "WITHDRAWN" })
    .eq("project_id", pid)
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Working knowledge withdrawn." };
}

export async function moveWorkingKnowledge(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = orderedRecordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  return moveOrderedRecord(
    "investigation_working_knowledge",
    pid,
    parsed.data.id,
    parsed.data.direction,
    supabase,
  );
}

export async function linkWorkingKnowledgeSupport(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = workingKnowledgeSupportSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, user, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("investigation_working_knowledge_support")
    .insert({
      project_id: pid,
      knowledge_id: parsed.data.knowledge_id,
      source_id: parsed.data.source_id ?? null,
      evidence_id: parsed.data.evidence_id ?? null,
      analyst_note: parsed.data.analyst_note ?? null,
      created_by: user.id,
    });
  if (error)
    return {
      error:
        error.code === "23505"
          ? "That support record is already linked."
          : error.message,
    };
  refresh(pid);
  return { success: "Support linked." };
}

export async function unlinkWorkingKnowledgeSupport(
  projectId: string,
  input: unknown,
): Promise<DirectionActionState> {
  const parsed = recordIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, projectId: pid } = await requireOwnedProject(projectId);
  const { error } = await supabase
    .from("investigation_working_knowledge_support")
    .delete()
    .eq("project_id", pid)
    .eq("id", parsed.data.id);
  if (error) return { error: error.message };
  refresh(pid);
  return { success: "Support unlinked." };
}
