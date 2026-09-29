import { notFound } from "next/navigation";

import { CollectionWorkspace } from "@/components/investigations/collection/collection-workspace";
import { requireOwnedProject } from "@/lib/projects/ownership";

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await requireOwnedProject(id).catch(() => notFound());

  const [
    projectResult,
    questionsResult,
    gapsResult,
    requirementsResult,
    requirementGapLinksResult,
    sourcesResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
  ] = await Promise.all([
    context.supabase
      .from("projects")
      .select("id,name,research_question,purpose,priority,due_at")
      .eq("id", context.projectId)
      .single(),
    context.supabase
      .from("investigation_questions")
      .select("id,question,status,sort_order")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("investigation_information_gaps")
      .select("id,description,status,sort_order,resolved_at")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("collection_requirements")
      .select("*")
      .eq("project_id", context.projectId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    context.supabase
      .from("collection_requirement_gap_links")
      .select("requirement_id,gap_id")
      .eq("project_id", context.projectId),
    context.supabase
      .from("sources")
      .select("id,title,source_type,publisher,collection_rationale,archived_at")
      .eq("project_id", context.projectId)
      .order("updated_at", { ascending: false }),
    context.supabase
      .from("source_gap_links")
      .select("source_id,gap_id")
      .eq("project_id", context.projectId),
    context.supabase
      .from("source_requirement_links")
      .select("source_id,requirement_id")
      .eq("project_id", context.projectId),
  ]);

  if (projectResult.error || !projectResult.data) notFound();

  const failed = [
    questionsResult,
    gapsResult,
    requirementsResult,
    requirementGapLinksResult,
    sourcesResult,
    sourceGapLinksResult,
    sourceRequirementLinksResult,
  ].some((result) => result.error);

  if (failed) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Collection workspace yüklenemedi. Stage 2 migration 054'ün uygulanmış
          olduğunu ve Supabase API schema cache'in yenilendiğini doğrulayın.
        </div>
      </section>
    );
  }

  return (
    <CollectionWorkspace
      projectId={context.projectId}
      project={projectResult.data}
      questions={questionsResult.data ?? []}
      gaps={gapsResult.data ?? []}
      requirements={requirementsResult.data ?? []}
      requirementGapLinks={requirementGapLinksResult.data ?? []}
      sources={sourcesResult.data ?? []}
      sourceGapLinks={sourceGapLinksResult.data ?? []}
      sourceRequirementLinks={sourceRequirementLinksResult.data ?? []}
    />
  );
}
