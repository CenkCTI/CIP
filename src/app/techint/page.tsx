import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listGlobalTechnicalAgenda } from "@/lib/techint/intelligence/queries";
import { globalPriorityReasonLabel } from "@/lib/techint/priority/engine";

function pageNumber(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw ?? "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const query = await searchParams;
  const { supabase } = await requireUser();
  const agenda = await listGlobalTechnicalAgenda(supabase, { page: pageNumber(query.page), pageSize: 25 });
  const hasNext = (agenda.page + 1) * agenda.pageSize < agenda.total;
  const critical = agenda.items.filter((item) => item.priority === "CRITICAL").length;
  const high = agenda.items.filter((item) => item.priority === "HIGH").length;

  return (
    <section className="space-y-5">
      <header className="citem-page-header">
        <div>
          <p className="citem-eyebrow">CİTEM / TechINT / Global View</p>
          <h1 className="citem-title">Global View</h1>
          <p className="citem-subtitle">
            Explainable, profile-independent technical priority. This is a global technical agenda, not organizational business risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="citem-button" href="/techint/entities">Entity normalization</Link>
          <Link className="citem-button-ghost" href="/techint/sources">Collection operations</Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Ranked signals" value={agenda.total} />
        <Metric label="Critical on page" value={critical} />
        <Metric label="High on page" value={high} />
      </div>

      <div className="card panel-corners border-l-2 border-l-amber-500/60">
        <p className="citem-eyebrow">Global technical agenda</p>
        <h2 className="citem-section-title mt-1">What deserves attention now?</h2>
        <p className="mt-2 max-w-3xl text-sm text-stone-400">
          Priority combines bounded source-backed facts such as KEV, confirmed exploitation, EPSS, technical severity, freshness, advisory context, revisions, and multi-source support. AI does not assign this priority.
        </p>
      </div>

      {agenda.error ? (
        <div className="card text-sm text-stone-500">Global Priority projections are not available in this environment yet.</div>
      ) : !agenda.items.length ? (
        <div className="card text-sm text-stone-500">
          No evaluated Technical Signals yet. A successful source collection with new or changed observations will populate this agenda automatically.
        </div>
      ) : (
        <div className="space-y-3">
          {agenda.items.map((item) => (
            <article key={item.id} className="card panel-corners">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.13em]">
                    <span className="rounded border border-amber-900/60 px-2 py-1 text-amber-300">{item.priority}</span>
                    <span className="rounded border border-stone-800 px-2 py-1 text-stone-400">{item.signal.signal_type}</span>
                    <span className="rounded border border-stone-800 px-2 py-1 text-stone-500">{item.signal.lifecycle}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-stone-100">{item.signal.title}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    First seen {new Date(item.signal.first_seen_at).toLocaleString()} · last seen {new Date(item.signal.last_seen_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <p>{item.source_systems.length} source system(s)</p>
                  <p className="mt-1">rules {item.engine_version}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <p className="citem-eyebrow">Why prioritized</p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-300">
                    {item.reason_codes.map((reason) => <li key={reason}>• {globalPriorityReasonLabel(reason)}</li>)}
                  </ul>
                </div>
                <div className="rounded border border-stone-800 bg-stone-950/20 px-3 py-2 text-xs text-stone-400">
                  <p className="uppercase tracking-[0.13em] text-stone-600">Provenance</p>
                  <p className="mt-2">{item.source_systems.join(", ") || "No source summary"}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {(agenda.page > 0 || hasNext) && (
        <div className="flex items-center justify-between gap-3 text-sm">
          {agenda.page > 0 ? <Link className="citem-button-ghost" href={`/techint?page=${agenda.page - 1}`}>Previous</Link> : <span />}
          <span className="text-stone-500">Page {agenda.page + 1}</span>
          {hasNext ? <Link className="citem-button-ghost" href={`/techint?page=${agenda.page + 1}`}>Next</Link> : <span />}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card panel-corners">
      <p className="citem-eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-200">{value}</p>
    </div>
  );
}
