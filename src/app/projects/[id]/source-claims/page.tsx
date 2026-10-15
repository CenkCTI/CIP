import { SourceClaimDirectory } from "@/components/processing/source-claims-workspace";
import { requireOwnedProject } from "@/lib/projects/ownership";
import { sourceClaimKinds } from "@/lib/processing/source-claims";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

export default async function SourceClaimsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ q?: string; kind?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const context = await requireOwnedProject(id);
  const { data, error } = await context.supabase
    .from("source_claims")
    .select(
      "id,claim_summary,claim_kind,created_at,updated_at,source_claim_assertions(id,stance)",
    )
    .eq("project_id", context.projectId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1000);

  if (error) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Source Claims could not be loaded. Apply migration 060 and retry.
        </div>
      </section>
    );
  }

  const query = text(sp.q).trim();
  const queryLower = query.toLowerCase();
  const kind = sourceClaimKinds.includes(sp.kind as (typeof sourceClaimKinds)[number])
    ? text(sp.kind)
    : "";
  const rows = ((data ?? []) as Row[]).filter((claim) => {
    if (kind && text(claim.claim_kind) !== kind) return false;
    if (queryLower && !text(claim.claim_summary).toLowerCase().includes(queryLower)) {
      return false;
    }
    return true;
  });

  return (
    <SourceClaimDirectory
      projectId={context.projectId}
      rows={rows}
      query={query}
      kind={kind}
    />
  );
}
