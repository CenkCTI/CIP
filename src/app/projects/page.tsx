import Link from "next/link";

import { requireUser } from "@/lib/auth";
import {
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

  query = sp.sort === "name"
    ? query.order("name")
    : query.order("updated_at", { ascending: false });

  const { data, error } = await query.returns<Project[]>();
  const projects = data ?? [];

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / Project registry</p>
          <h1 className="citem-title">Intelligence projects</h1>
          <p className="citem-subtitle">
            Organize investigations, evidence, CTI entities, analytical relationships, reports, and AI-assisted workflows inside isolated project workspaces.
          </p>
        </div>
        <Link className="citem-button" href="/projects/new">+ New project</Link>
      </header>

      <form className="citem-filter-panel panel-corners grid gap-3 md:grid-cols-5">
        <label className="md:col-span-2">
          <span className="citem-label mb-2 block">Search registry</span>
          <input className="field" name="q" placeholder="Project name" defaultValue={sp.q} />
        </label>
        <label>
          <span className="citem-label mb-2 block">Research type</span>
          <select className="field" name="research_type" defaultValue={sp.research_type ?? ""}>
            <option value="">All types</option>
            {researchTypes.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Priority</span>
          <select className="field" name="priority" defaultValue={sp.priority ?? ""}>
            <option value="">All priorities</option>
            {priorities.map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span className="citem-label mb-2 block">Order</span>
          <select className="field" name="sort" defaultValue={sp.sort ?? "updated"}>
            <option value="updated">Recently updated</option>
            <option value="name">Project name</option>
          </select>
        </label>
        <div className="flex items-end md:col-span-5 md:justify-end">
          <button className="citem-button-ghost w-full md:w-auto" type="submit">Apply filters</button>
        </div>
      </form>

      {error && (
        <div role="alert" className="card border-red-900/60 text-red-300">
          Unable to load the project registry. Please refresh and try again.
        </div>
      )}

      {!error && !projects.length ? (
        <div className="citem-empty panel-corners">
          <div>
            <p className="citem-eyebrow">Registry clear</p>
            <h2 className="citem-section-title mt-3">No matching intelligence projects</h2>
            <p className="mt-2 text-sm text-stone-500">
              Create a project or broaden the active filters.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((project, index) => (
            <Link
              className="citem-project-card panel-corners"
              href={`/projects/${project.id}`}
              key={project.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="citem-label">Operation {String(index + 1).padStart(2, "0")}</p>
                  <h2 className="mt-3 truncate text-lg font-semibold text-stone-100">{project.name}</h2>
                </div>
                <span className="citem-badge shrink-0">{project.priority}</span>
              </div>
              <div className="mt-6 flex items-end justify-between gap-4 border-t border-amber-900/25 pt-4">
                <div>
                  <p className="text-sm text-stone-400">{project.research_type}</p>
                  <p className="mt-1 text-xs text-stone-600">
                    Updated {new Date(project.updated_at).toLocaleString()}
                  </p>
                </div>
                <span className="text-lg text-amber-400" aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
