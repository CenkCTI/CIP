import Link from "next/link";
import { notFound } from "next/navigation";

import { CtiDelete, CtiForm } from "@/components/cti-forms";
import { IndicatorEnrichment } from "@/components/enrichment/indicator-enrichment";
import { IndicatorProvenance } from "@/components/sources/indicator-provenance";
import { requireUser } from "@/lib/auth";
import {
  detectHashAlgorithm,
  safeDefangIndicatorValue,
} from "@/lib/cti/indicators";
import { ctiDetailPath } from "@/lib/cti-schema";
import { publicEnrichmentProviders } from "@/lib/enrichment/registry";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function formatDate(value: unknown) {
  if (!value) return "Not recorded";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function IndicatorSummary({ row }: { row: Row }) {
  const type = text(row.type);
  const canonical = text(row.normalized_value || row.value);
  const hashAlgorithm = type === "HASH" ? detectHashAlgorithm(canonical) : null;
  return (
    <article className="card" id="summary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="citem-label">IOC summary</p>
          <h1 className="mt-2 break-all font-mono text-2xl font-semibold text-stone-100">{canonical}</h1>
        </div>
        <div className="flex flex-wrap gap-2"><span className="citem-badge" data-tone="attention">{text(row.status || "UNVERIFIED")}</span><span className="citem-badge">{type}</span>{hashAlgorithm ? <span className="citem-badge">{hashAlgorithm}</span> : null}</div>
      </div>
      <dl className="mt-5 grid gap-4 md:grid-cols-2">
        <div><dt className="citem-label">Canonical value</dt><dd className="mt-1 break-all font-mono text-sm text-stone-300">{canonical}</dd></div>
        <div><dt className="citem-label">Safe defanged display</dt><dd className="mt-1 break-all font-mono text-sm text-stone-300">{safeDefangIndicatorValue(canonical, type)}</dd></div>
        <div><dt className="citem-label">Status</dt><dd className="mt-1 text-sm text-stone-300">{text(row.status || "UNVERIFIED")}</dd></div>
        <div><dt className="citem-label">Confidence</dt><dd className="mt-1 text-sm text-stone-300">{text(row.confidence) || "Not assessed"}</dd></div>
        <div><dt className="citem-label">First / last seen</dt><dd className="mt-1 text-sm text-stone-300">{formatDate(row.first_seen)} · {formatDate(row.last_seen)}</dd></div>
        <div><dt className="citem-label">Tags</dt><dd className="mt-1 text-sm text-stone-300">{strings(row.tags).length ? strings(row.tags).join(", ") : "No tags"}</dd></div>
        <div><dt className="citem-label">Legacy Indicator source</dt><dd className="mt-1 text-sm text-stone-300">{text(row.source) || "No source label recorded"}</dd></div>
        <div><dt className="citem-label">Current relevance</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">{text(row.current_relevance) || "Current relevance not assessed"}</dd></div>
        <div className="md:col-span-2"><dt className="citem-label">Analyst rationale</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">{text(row.analyst_rationale) || "No rationale recorded"}</dd></div>
      </dl>
    </article>
  );
}

export default async function IndicatorDetail({
  params,
}: {
  params: Promise<{ id: string; entityId: string }>;
}) {
  const { id, entityId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name")
    .eq("id", id)
    .single();
  if (projectError || !project) notFound();

  const { data: indicator, error: indicatorError } = await supabase
    .from("indicators")
    .select("*")
    .eq("project_id", id)
    .eq("id", entityId)
    .single();
  if (indicatorError || !indicator) notFound();

  const [
    observationsResult,
    sourcesResult,
    runsResult,
    resultsResult,
    actorsResult,
    campaignsResult,
    malwareResult,
    indicatorsResult,
    cvesResult,
    mitreResult,
    actorLinksResult,
    campaignLinksResult,
    malwareLinksResult,
  ] = await Promise.all([
    supabase.from("indicator_observations").select("*").eq("project_id", id).eq("indicator_id", entityId).order("observed_at", { ascending: false, nullsFirst: false }).order("ingested_at", { ascending: false }),
    supabase.from("sources").select("*").eq("project_id", id).order("updated_at", { ascending: false }),
    supabase.from("enrichment_runs").select("*").eq("project_id", id).eq("indicator_id", entityId).order("requested_at", { ascending: false }).order("id", { ascending: true }),
    supabase.from("enrichment_results").select("*").eq("project_id", id).eq("indicator_id", entityId).order("queried_at", { ascending: false }).order("id", { ascending: true }),
    supabase.from("threat_actors").select("*").eq("project_id", id),
    supabase.from("campaigns").select("*").eq("project_id", id),
    supabase.from("malware").select("*").eq("project_id", id),
    supabase.from("indicators").select("*").eq("project_id", id),
    supabase.from("cves").select("*").eq("project_id", id),
    supabase.from("mitre_techniques").select("*").eq("project_id", id),
    supabase.from("threat_actor_indicators").select("threat_actor_id").eq("project_id", id).eq("indicator_id", entityId),
    supabase.from("campaign_indicators").select("campaign_id").eq("project_id", id).eq("indicator_id", entityId),
    supabase.from("malware_indicators").select("malware_id").eq("project_id", id).eq("indicator_id", entityId),
  ]);

  if (
    [actorsResult, campaignsResult, malwareResult, indicatorsResult, cvesResult, mitreResult, actorLinksResult, campaignLinksResult, malwareLinksResult].some((result) => result.error)
  ) {
    return <section className="mx-auto max-w-5xl"><div className="card text-red-300">Indicator relationships could not be loaded.</div></section>;
  }

  const observations = observationsResult.error ? [] : ((observationsResult.data ?? []) as Row[]);
  const sources = sourcesResult.error ? [] : ((sourcesResult.data ?? []) as Row[]);
  const runs = runsResult.error ? [] : ((runsResult.data ?? []) as Row[]);
  const results = resultsResult.error ? [] : ((resultsResult.data ?? []) as Row[]);
  const actors = (actorsResult.data ?? []) as Row[];
  const campaigns = (campaignsResult.data ?? []) as Row[];
  const malware = (malwareResult.data ?? []) as Row[];
  const selectedActorIds = (actorLinksResult.data ?? []).map((row) => row.threat_actor_id);
  const selectedCampaignIds = (campaignLinksResult.data ?? []).map((row) => row.campaign_id);
  const selectedMalwareIds = (malwareLinksResult.data ?? []).map((row) => row.malware_id);
  const options = {
    threat_actor_ids: actors,
    campaign_ids: campaigns,
    indicator_ids: (indicatorsResult.data ?? []) as Row[],
    malware_ids: malware,
    cve_ids: (cvesResult.data ?? []) as Row[],
    mitre_technique_ids: (mitreResult.data ?? []) as Row[],
  };
  const selected = {
    threat_actor_ids: selectedActorIds,
    campaign_ids: selectedCampaignIds,
    malware_ids: selectedMalwareIds,
    indicator_ids: [],
    cve_ids: [],
    mitre_technique_ids: [],
  };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="text-sm text-amber-300" href={`/projects/${id}?tab=indicators`}>← Back to IOC Workbench</Link>
        <span className="text-xs text-stone-600">Investigation: {project.name}</span>
      </div>
      <nav className="flex flex-wrap gap-2 rounded border border-stone-800/80 bg-black/10 p-2 text-xs" aria-label="Indicator detail sections">
        {[['Summary','summary'],['Observations','observations'],['Enrichment','enrichment'],['Sources','sources'],['Relationships','relationships'],['Assessment','assessment']].map(([label, anchor]) => <a className="rounded px-3 py-2 text-stone-400 hover:bg-stone-900 hover:text-amber-300" href={`#${anchor}`} key={anchor}>{label}</a>)}
      </nav>

      <IndicatorSummary row={indicator as Row} />
      <IndicatorProvenance projectId={id} observations={observations} sources={sources} enrichmentResults={results} currentUserId={user.id} />
      <IndicatorEnrichment projectId={id} indicatorId={entityId} indicatorType={text(indicator.type)} providers={publicEnrichmentProviders()} runs={runs} results={results} sources={sources} />

      <section className="card" id="relationships">
        <h2 className="font-semibold text-stone-100">Related entities</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div><p className="citem-label">Threat Actors</p>{actors.filter((row) => selectedActorIds.includes(text(row.id))).length ? <ul className="mt-2 list-disc pl-5 text-sm text-stone-300">{actors.filter((row) => selectedActorIds.includes(text(row.id))).map((row) => <li key={text(row.id)}><Link className="hover:text-amber-300" href={ctiDetailPath(id, "actors", text(row.id))}>{text(row.name)}</Link></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">No linked records.</p>}</div>
          <div><p className="citem-label">Campaigns</p>{campaigns.filter((row) => selectedCampaignIds.includes(text(row.id))).length ? <ul className="mt-2 list-disc pl-5 text-sm text-stone-300">{campaigns.filter((row) => selectedCampaignIds.includes(text(row.id))).map((row) => <li key={text(row.id)}><Link className="hover:text-amber-300" href={ctiDetailPath(id, "campaigns", text(row.id))}>{text(row.name)}</Link></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">No linked records.</p>}</div>
          <div><p className="citem-label">Malware</p>{malware.filter((row) => selectedMalwareIds.includes(text(row.id))).length ? <ul className="mt-2 list-disc pl-5 text-sm text-stone-300">{malware.filter((row) => selectedMalwareIds.includes(text(row.id))).map((row) => <li key={text(row.id)}><Link className="hover:text-amber-300" href={ctiDetailPath(id, "malware", text(row.id))}>{text(row.name)}</Link></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">No linked records.</p>}</div>
        </div>
      </section>

      <section className="card" id="assessment">
        <p className="citem-label">Analyst-controlled assessment</p>
        <h2 className="mt-2 font-semibold text-stone-100">Edit Indicator and relationships</h2>
        <p className="mt-2 text-sm text-stone-500">Enrichment results never change Indicator status, confidence, rationale or current relevance automatically.</p>
        <div className="mt-4"><CtiForm tab="indicators" projectId={id} row={indicator as Row} options={options} selected={selected} /></div>
        <CtiDelete tab="indicators" projectId={id} row={indicator as Row} />
      </section>
    </section>
  );
}
