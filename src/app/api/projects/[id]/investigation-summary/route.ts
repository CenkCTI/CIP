import { z } from "zod";

import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const projectIdSchema = z.string().uuid();

const countTables = [
  ["indicators", "Indicators"],
  ["evidence", "Evidence"],
  ["research_notes", "Notes"],
  ["timeline_events", "Timeline Events"],
  ["threat_actors", "Threat Actors"],
  ["campaigns", "Campaigns"],
  ["malware", "Malware"],
  ["cves", "CVEs"],
  ["reports", "Reports"],
] as const;

function noStore(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const parsedId = projectIdSchema.safeParse(rawId);
  if (!parsedId.success) return noStore({ error: "not_found" }, 404);

  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", parsedId.data)
    .single();

  if (projectError || !project || project.owner_id !== user.id) {
    return noStore({ error: "not_found" }, 404);
  }

  const results = await Promise.all(
    countTables.map(async ([table, label]) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("project_id", parsedId.data);
      return { label, count: count ?? 0, error };
    }),
  );

  if (results.some((result) => result.error)) {
    return noStore({ error: "summary_unavailable" }, 500);
  }

  return noStore({
    ownerLabel: "Current analyst",
    counts: Object.fromEntries(
      results.map((result) => [result.label, result.count]),
    ),
  });
}
