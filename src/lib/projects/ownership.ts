import { z } from "zod";

import { requireUser } from "@/lib/auth";

const projectIdSchema = z.string().uuid();

export async function requireOwnedProject(projectId: string) {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) throw new Error("Investigation not found");

  const context = await requireUser();
  const { data, error } = await context.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", parsed.data)
    .single();

  if (error || !data || data.owner_id !== context.user.id) {
    throw new Error("Investigation not found");
  }

  return {
    ...context,
    projectId: parsed.data,
  };
}
