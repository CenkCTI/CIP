import Link from "next/link";

import { requireUser } from "@/lib/auth";
import type { Project } from "@/lib/projects/schema";

function priorityCount(investigations: Project[], priority: string) {
  return investigations.filter(
    (investigation) => investigation.priority.toUpperCase() === priority,
  ).length;
}

function priorityTone(priority: string) {
  const normalized = priority.toUpperCase();
  if (normalized === "CRITICAL") return "critical";
  if (normalized === "HIGH" || normalized === "MEDIUM") return "attention";
  return "neutral";
}

export default async function Page() {
  const { supabase } = await requireUser();
  const { data = [] } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<Project[]>();

  const investigations = data ?? [];
  const critical = priorityCount(investigations, "CRITICAL");
  const high = priorityCount(investigations, "HIGH");
  const researchTypes = new Set(
    investigations.map((investigation) => investigation.research_type),
  ).size;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeThisWeek = investigations.filter(
    (investigation) =>
      new Date(investigation.updated_at).getTime() >= sevenDaysAgo,
  ).length;

  return (
    <section className="space-y-5">
      <div className="command-hero panel-corners">
        <div className="command-hero-content">
          <p className="citem-eyebrow">CİTEM / Operational picture</p>
          <h1 className="command-hero-title">
            Intelligence becomes <strong>direction.</strong>
          </h1>
          <p className="command-hero-copy">
            Build evidence-backed cyber intelligence, connect threat activity,
            and move from fragmented signals to analyst-controlled operational
            judgment.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/projects/new" className="citem-button">
              Create investigation
            </Link>
            <Link href="/projects" className="citem-button-ghost">
              Open Investigation registry
            </Link>
          </div>
        </div>
      </div>

      <div className="metric-grid" aria-label="Workspace metrics">
        <article className="metric-card panel-corners">
          <p className="citem-label">Total investigations</p>
          <p className="metric-value">
            {investigations.length.toString().padStart(2, "0")}
          </p>
          <p className="metric-caption">Owned technical investigations</p>
        </article>
        <article className="metric-card panel-corners">
          <p className="citem-label">Critical / high</p>
          <p className="metric-value">{critical + high}</p>
          <p className="metric-caption">
            Priority investigations requiring attention
          </p>
        </article>
        <article className="metric-card panel-corners">
          <p className="citem-label">Research domains</p>
          <p className="metric-value">{researchTypes}</p>
          <p className="metric-caption">Distinct Investigation research types</p>
        </article>
        <article className="metric-card panel-corners">
          <p className="citem-label">Updated 7 days</p>
          <p className="metric-value">{activeThisWeek}</p>
          <p className="metric-caption">
            Investigations with recent analyst activity
          </p>
        </article>
      </div>

      <div className="citem-grid-two">
        <section className="card panel-corners">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="citem-label">Current operations</p>
              <h2 className="citem-section-title mt-2">
                Recent investigations
              </h2>
            </div>
            <Link href="/projects" className="citem-text-link text-xs">
              View registry →
            </Link>
          </div>

          <div className="mt-4">
            {investigations.length ? (
              investigations.slice(0, 6).map((investigation) => (
                <Link
                  className="citem-project-row"
                  href={`/projects/${investigation.id}`}
                  key={investigation.id}
                >
                  <span>
                    <span className="citem-project-name block">
                      {investigation.name}
                    </span>
                    <span className="citem-meta block">
                      {investigation.investigation_status ?? "DRAFT"} ·{" "}
                      {investigation.research_type} · updated{" "}
                      {new Date(investigation.updated_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span
                    className="citem-badge"
                    data-tone={priorityTone(investigation.priority)}
                  >
                    {investigation.priority}
                  </span>
                </Link>
              ))
            ) : (
              <div className="citem-empty mt-4 panel-corners">
                <div>
                  <p className="citem-section-title">No active investigations</p>
                  <p className="mt-2 text-sm text-stone-500">
                    Create the first CİTEM technical Investigation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="card panel-corners">
          <p className="citem-label">Intelligence flow</p>
          <h2 className="citem-section-title mt-2">Analyst-controlled cycle</h2>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            CİTEM keeps collection, structuring, analysis, and dissemination
            inside a traceable Investigation context.
          </p>

          <div className="citem-cycle">
            {[
              ["01", "Collect", "Notes · evidence"],
              ["02", "Structure", "Entities · timeline"],
              ["03", "Analyze", "Relations · MITRE"],
              ["04", "Direct", "Reports · actions"],
            ].map(([index, title, detail]) => (
              <div className="citem-cycle-step" key={index}>
                <span className="citem-cycle-index">{index}</span>
                <span>
                  <span className="block text-stone-300">{title}</span>
                  <span className="mt-0.5 block text-[11px] text-stone-600">
                    {detail}
                  </span>
                </span>
                <span className="citem-cycle-line" aria-hidden="true" />
              </div>
            ))}
          </div>

          <div className="citem-controls-summary mt-6">
            <div className="citem-status-row">
              <span>Workspace controls</span>
              <span className="citem-badge" data-tone="secure">
                Active
              </span>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-stone-500">
              <p>• Investigation ownership and RLS isolation</p>
              <p>• Private evidence and signed access</p>
              <p>• Explicit approval before AI persistence</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
