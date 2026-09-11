import { NextResponse } from "next/server";

import { requireOwnedProject } from "@/lib/projects/ownership";

const tokenize = (value: string | null | undefined) =>
  new Set(
    String(value ?? "")
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );

const textArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const overlap = (left: string[], right: string[]) => {
  const rightSet = new Set(right.map((value) => value.toLocaleLowerCase()));
  return left.filter((value) => rightSet.has(value.toLocaleLowerCase()));
};

const tokenOverlap = (left: string, right: string) => {
  const a = tokenize(left);
  const b = tokenize(right);
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { supabase, user, projectId } = await requireOwnedProject(id);

    const [
      projectResult,
      questionsResult,
      gapsResult,
      knowledgeResult,
      supportResult,
      sourcesResult,
      evidenceResult,
      relatedResult,
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase
        .from("investigation_questions")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("investigation_information_gaps")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("investigation_working_knowledge")
        .select("*")
        .eq("project_id", projectId)
        .order("state", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("investigation_working_knowledge_support")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase
        .from("sources")
        .select("id,title,source_type,publisher,verification_state")
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("evidence")
        .select("id,title,type,collection_date")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("projects")
        .select(
          "id,name,research_question,tags,scope_geography,scope_sectors,scope_activity_types,scope_actors,updated_at",
        )
        .eq("owner_id", user.id)
        .neq("id", projectId)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

    const errors = [
      projectResult.error,
      questionsResult.error,
      gapsResult.error,
      knowledgeResult.error,
      supportResult.error,
      sourcesResult.error,
      evidenceResult.error,
      relatedResult.error,
    ].filter(Boolean);
    if (errors.length) {
      return NextResponse.json(
        { error: "Unable to load Investigation direction." },
        { status: 500 },
      );
    }

    const project = projectResult.data;
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const related = (relatedResult.data ?? [])
      .map((candidate) => {
        let score = 0;
        const reasons: string[] = [];

        const geo = overlap(
          textArray(project.scope_geography),
          textArray(candidate.scope_geography),
        );
        if (geo.length) {
          score += 3;
          reasons.push(`Geography: ${geo.slice(0, 2).join(", ")}`);
        }

        const sectors = overlap(
          textArray(project.scope_sectors),
          textArray(candidate.scope_sectors),
        );
        if (sectors.length) {
          score += 3;
          reasons.push(`Sector: ${sectors.slice(0, 2).join(", ")}`);
        }

        const actors = overlap(
          textArray(project.scope_actors),
          textArray(candidate.scope_actors),
        );
        if (actors.length) {
          score += 4;
          reasons.push(`Actor/cluster: ${actors.slice(0, 2).join(", ")}`);
        }

        const activity = overlap(
          textArray(project.scope_activity_types),
          textArray(candidate.scope_activity_types),
        );
        if (activity.length) {
          score += 2;
          reasons.push(`Activity: ${activity.slice(0, 2).join(", ")}`);
        }

        const tags = overlap(textArray(project.tags), textArray(candidate.tags));
        if (tags.length) {
          score += 1;
          reasons.push(`Tags: ${tags.slice(0, 2).join(", ")}`);
        }

        const sharedWords =
          tokenOverlap(project.name, candidate.name) +
          tokenOverlap(project.research_question ?? "", candidate.research_question ?? "");
        if (sharedWords > 0) {
          score += Math.min(sharedWords, 2);
          reasons.push("Related title/question terms");
        }

        return {
          id: candidate.id,
          name: candidate.name,
          research_question: candidate.research_question,
          updated_at: candidate.updated_at,
          score,
          reasons,
        };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at))
      .slice(0, 6);

    return NextResponse.json({
      project,
      questions: questionsResult.data ?? [],
      gaps: gapsResult.data ?? [],
      workingKnowledge: knowledgeResult.data ?? [],
      support: supportResult.data ?? [],
      sourceOptions: sourcesResult.data ?? [],
      evidenceOptions: evidenceResult.data ?? [],
      related,
    });
  } catch {
    return NextResponse.json({ error: "Investigation not found." }, { status: 404 });
  }
}
