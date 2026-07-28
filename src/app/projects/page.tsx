import Link from "next/link";

import { requireUser } from "@/lib/auth";
import {
  assessmentConfidenceLevels,
  investigationStatuses,
  priorities,
  researchTypes,
  type Project,
} from "@/lib/projects/schema";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  let query = supabase.from("projects").select("*");

  if (sp.q) query = query.ilike("name", `%${sp.q}%`);
  if (sp.research_type) query = query.eq("research_type", sp.research_type);
  if (sp.priority) query = query.eq("priority", sp.priority);
  if (sp.investigation_status) {
    query = query.eq("investigation_status", sp.investigation_status);
  }
  if (sp.assessment_confidence) {
    query = query.eq("assessment_confidence", sp.assessment_confidence);
  }
  if (sp.closed === "open") query = query.is("closed_at", null);
  if (sp.closed === "closed") query = query.not("closed_at", "is", null);

  query =
    sp.sort === "name"
      ? query.order("name")
      : query.order("updated_at", { ascending: false });

  const { data, error } = await query.returns<Project[]>();
  const investigations = data ?? [];

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / Investigation registry</p>
          <h1 className="citem-title">Investigations</h1>
          <p className="citem-subtitle">
            Define technical questions, preserve evidence and IOCs, and develop
            analyst-controlled operational assessments inside isolated workspaces.
          </p>
        </div>
        <Link className="citem-button" href="/projects/new">
          + New investigation
        </Link>
      </header>

      <form className="citem-filter-panel panel-corners grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <label className="md:col-span-2">
          <span className="citem-label mb-2 block">Search registry</span>
          <input
            className="field"
            name="q"
            placeholder="Investigation title"
            defaultValue={sp.q}
          />
        </label>
        <label>
          <span className="citem-label mb-2 block">Research type</span>
          <select
            className="field"
            name="research_type"
            defaultValue={sp.research_type ?? ""}
          >
            <option value="">All types</option>
            {researchTypes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Priority</span>
          <select
            className="field"
            name="priority"
            defaultValue={sp.priority ?? ""}
          >
            <option value="">All priorities</option>
            {priorities.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Status</span>
          <select
            className="field"
            name="investigation_status"
            defaultValue={sp.investigation_status ?? ""}
          >
            <option value="">All statuses</option>
            {investigationStatuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Confidence</span>
          <select
            className="field"
            name="assessment_confidence"
            defaultValue={sp.assessment_confidence ?? ""}
          >
            <option value="">Any confidence</option>
            {assessmentConfidenceLevels.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Open / closed</span>
          <select className="field" name="closed" defaultValue={sp.closed ?? ""}>
            <option value="">Any state</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Order</span>
          <select className="field" name="sort" defaultValue={sp.sort ?? "updated"}>
            <option value="updated">Recently updated</option>
            <option value="name">Investigation title</option>
          </select>
        </label>
        <div className="flex items-end md:col-span-3 xl:col-span-7 md:justify-end">
          <button className="citem-button-ghost w-full md:w-auto" type="submit">
            Apply filters
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="card border-red-900/60 text-red-300">
          Unable to load the Investigation registry. Apply migration 016 and try
          again.
        </div>
      )}

      {!error && !investigations.length ? (
        <div className="citem-empty panel-corners">
          <div>
            <p className="citem-eyebrow">Registry clear</p>
            <h2 className="citem-section-title mt-3">
              No matching investigations
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Create an Investigation or broaden the active filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {investigations.map((investigation, index) => (
            <Link
              className="citem-project-card panel-corners"
              href={`/projects/${investigation.id}`}
              key={investigation.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="citem-label">
                    Investigation {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-3 truncate text-lg font-semibold text-stone-100">
                    {investigation.name}
                  </h2>
                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-400">
                    {investigation.research_question ||
                      "No research question defined"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="citem-badge" data-tone="attention">
                    {investigation.investigation_status ?? "DRAFT"}
                  </span>
                  <span className="citem-badge">{investigation.priority}</span>
                </div>
              </div>
              <div className="mt-6 grid gap-3 border-t border-amber-900/25 pt-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="citem-label">Type</p>
                  <p className="mt-1 text-stone-400">
                    {investigation.research_type}
                  </p>
                </div>
                <div>
                  <p className="citem-label">Assessment confidence</p>
                  <p className="mt-1 text-stone-400">
                    {investigation.assessment_confidence ||
                      "Confidence not assessed"}
                  </p>
                </div>
                <div>
                  <p className="citem-label">
                    {investigation.closed_at ? "Closed" : "Last updated"}
                  </p>
                  <p className="mt-1 text-stone-400">
                    {new Date(
                      investigation.closed_at ?? investigation.updated_at,
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
