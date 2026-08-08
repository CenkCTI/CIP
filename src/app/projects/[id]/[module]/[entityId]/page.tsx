import Link from "next/link";
import { notFound } from "next/navigation";

import { CtiDelete, CtiForm } from "@/components/cti-forms";
import {
  ClusterMembershipForm,
  ReconstructionForm,
} from "@/components/reconstruction/forms";
import { requireUser } from "@/lib/auth";
import { visibleCampaignActivity } from "@/lib/reconstruction/presentation";
import {
  detectHashAlgorithm,
  safeDefangIndicatorValue,
} from "@/lib/cti/indicators";
import {
  ctiDetailPath,
  ctiModuleLabels,
  ctiRecordTitle,
  ctiTabs,
  entityTables,
} from "@/lib/cti-schema";

type Row = Record<string, unknown>;
const ss = (value: unknown) => String(value ?? "");
const aa = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const relationConfig = {
  actors: [
    ["threat_actor_malware", "threat_actor_id", "malware_id", "malware"],
    [
      "threat_actor_indicators",
      "threat_actor_id",
      "indicator_id",
      "indicators",
    ],
    [
      "threat_actor_mitre_techniques",
      "threat_actor_id",
      "mitre_technique_id",
      "mitre",
    ],
  ],
  campaigns: [
    ["campaign_threat_actors", "campaign_id", "threat_actor_id", "actors"],
    ["campaign_malware", "campaign_id", "malware_id", "malware"],
    ["campaign_indicators", "campaign_id", "indicator_id", "indicators"],
    ["campaign_mitre_techniques", "campaign_id", "mitre_technique_id", "mitre"],
  ],
  indicators: [
    ["threat_actor_indicators", "indicator_id", "threat_actor_id", "actors"],
    ["campaign_indicators", "indicator_id", "campaign_id", "campaigns"],
    ["malware_indicators", "indicator_id", "malware_id", "malware"],
  ],
  malware: [
    ["threat_actor_malware", "malware_id", "threat_actor_id", "actors"],
    ["campaign_malware", "malware_id", "campaign_id", "campaigns"],
    ["malware_indicators", "malware_id", "indicator_id", "indicators"],
    ["cve_malware", "malware_id", "cve_id", "cves"],
    ["malware_mitre_techniques", "malware_id", "mitre_technique_id", "mitre"],
  ],
  cves: [["cve_malware", "cve_id", "malware_id", "malware"]],
  mitre: [
    [
      "threat_actor_mitre_techniques",
      "mitre_technique_id",
      "threat_actor_id",
      "actors",
    ],
    [
      "campaign_mitre_techniques",
      "mitre_technique_id",
      "campaign_id",
      "campaigns",
    ],
    ["malware_mitre_techniques", "mitre_technique_id", "malware_id", "malware"],
  ],
} as const;
const optionKeys = {
  actors: "threat_actor_ids",
  campaigns: "campaign_ids",
  indicators: "indicator_ids",
  malware: "malware_ids",
  cves: "cve_ids",
  mitre: "mitre_technique_ids",
} as const;

function formatOptionalDate(value: unknown) {
  if (!value) return "Not recorded";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function IndicatorSummary({ row }: { row: Row }) {
  const type = ss(row.type);
  const canonical = ss(row.normalized_value || row.value);
  const hashAlgorithm = type === "HASH" ? detectHashAlgorithm(canonical) : null;

  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="citem-label">IOC summary</p>
          <h1 className="mt-2 break-all font-mono text-2xl font-semibold text-stone-100">
            {canonical}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="citem-badge" data-tone="attention">
            {ss(row.status || "UNVERIFIED")}
          </span>
          <span className="citem-badge">{type}</span>
          {hashAlgorithm ? (
            <span className="citem-badge">{hashAlgorithm}</span>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <dt className="citem-label">Canonical value</dt>
          <dd className="mt-1 break-all font-mono text-sm text-stone-300">
            {canonical}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Safe defanged display</dt>
          <dd className="mt-1 break-all font-mono text-sm text-stone-300">
            {safeDefangIndicatorValue(canonical, type)}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Confidence</dt>
          <dd className="mt-1 text-sm text-stone-300">{ss(row.confidence)}</dd>
        </div>
        <div>
          <dt className="citem-label">First / last seen</dt>
          <dd className="mt-1 text-sm text-stone-300">
            {formatOptionalDate(row.first_seen)} ·{" "}
            {formatOptionalDate(row.last_seen)}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Source</dt>
          <dd className="mt-1 text-sm text-stone-300">
            {ss(row.source) || "No source label recorded"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Tags</dt>
          <dd className="mt-1 text-sm text-stone-300">
            {aa(row.tags).length ? aa(row.tags).join(", ") : "No tags"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Analyst rationale</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">
            {ss(row.analyst_rationale) || "No rationale recorded"}
          </dd>
        </div>
        <div>
          <dt className="citem-label">Current relevance</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-stone-300">
            {ss(row.current_relevance) || "Current relevance not assessed"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function ObservationHistory({
  rows,
  currentUserId,
}: {
  rows: Row[];
  currentUserId: string;
}) {
  return (
    <section className="card">
      <div>
        <p className="citem-label">Provenance</p>
        <h2 className="mt-2 text-lg font-semibold text-stone-100">
          Observation history
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          The canonical Indicator remains unique while every accepted observed
          form is preserved separately.
        </p>
      </div>

      {rows.length ? (
        <ol className="mt-4 grid gap-3">
          {rows.map((observation) => (
            <li
              className="rounded border border-stone-800/80 bg-black/10 p-3"
              key={ss(observation.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <code className="break-all text-sm text-stone-200">
                  {ss(observation.observed_value)}
                </code>
                <span className="citem-badge">
                  {ss(observation.origin_kind)}
                </span>
              </div>
              <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                <div>
                  <dt className="text-stone-600">Observed time</dt>
                  <dd className="mt-1 text-stone-400">
                    {formatOptionalDate(observation.observed_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Ingested time</dt>
                  <dd className="mt-1 text-stone-400">
                    {formatOptionalDate(observation.ingested_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Source label</dt>
                  <dd className="mt-1 text-stone-400">
                    {ss(observation.source_label) || "Not supplied"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Confidence</dt>
                  <dd className="mt-1 text-stone-400">
                    {ss(observation.confidence) || "Not assessed"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Creator</dt>
                  <dd className="mt-1 text-stone-400">
                    {ss(observation.created_by) === currentUserId
                      ? "Current analyst"
                      : "Authorized analyst"}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone-600">Analyst note</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-stone-400">
                    {ss(observation.analyst_note) || "No note"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-stone-500">
          No observation records exist yet. Legacy Indicators remain valid and
          can receive new observations through bulk intake.
        </p>
      )}
    </section>
  );
}

export default async function Detail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; module: string; entityId: string }>;
  searchParams: Promise<{ historical?: string }>;
}) {
  const { id, module, entityId } = await params;
  const showHistorical = (await searchParams).historical === "1";
  if (!ctiTabs.includes(module as never)) notFound();
  const tab = module as keyof typeof entityTables;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name")
    .eq("id", id)
    .single();
  if (projectError || !project) notFound();
  const { data: row, error } = await supabase
    .from(entityTables[tab])
    .select("*")
    .eq("project_id", id)
    .eq("id", entityId)
    .single();
  if (error || !row) notFound();

  const { data: observations, error: observationsError } =
    tab === "indicators"
      ? await supabase
          .from("indicator_observations")
          .select("*")
          .eq("project_id", id)
          .eq("indicator_id", entityId)
          .order("observed_at", { ascending: false, nullsFirst: false })
          .order("ingested_at", { ascending: false })
          .order("id", { ascending: true })
      : { data: [] as Row[], error: null };
  if (observationsError) notFound();

  const [actors, campaigns, indicators, malware, cves, mitre] =
    await Promise.all([
      supabase.from("threat_actors").select("*").eq("project_id", id),
      supabase.from("campaigns").select("*").eq("project_id", id),
      supabase.from("indicators").select("*").eq("project_id", id),
      supabase.from("malware").select("*").eq("project_id", id),
      supabase.from("cves").select("*").eq("project_id", id),
      supabase.from("mitre_techniques").select("*").eq("project_id", id),
    ]);
  if (
    [actors, campaigns, indicators, malware, cves, mitre].some(
      (result) => result.error,
    )
  ) {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="card text-red-300">
          Unable to load CTI relationship options. Please refresh and try again.
        </div>
      </section>
    );
  }
  const optionRows = {
    actors: actors.data ?? [],
    campaigns: campaigns.data ?? [],
    indicators: indicators.data ?? [],
    malware: malware.data ?? [],
    cves: cves.data ?? [],
    mitre: mitre.data ?? [],
  };
  const options = {
    threat_actor_ids: optionRows.actors as Row[],
    campaign_ids: optionRows.campaigns as Row[],
    indicator_ids: optionRows.indicators as Row[],
    malware_ids: optionRows.malware as Row[],
    cve_ids: optionRows.cves as Row[],
    mitre_technique_ids: optionRows.mitre as Row[],
  };
  const relRows = await Promise.all(
    relationConfig[tab].map(([join]) =>
      supabase
        .from(join)
        .select("*")
        .eq("project_id", id)
        .eq(
          relationConfig[tab].find((config) => config[0] === join)![1],
          entityId,
        ),
    ),
  );
  if (relRows.some((result) => result.error)) {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="card text-red-300">
          Unable to load CTI relationships. Please refresh and try again.
        </div>
      </section>
    );
  }
  const selected: Record<string, string[]> = {};
  const related = relationConfig[tab].map((configuration, index) => {
    const [, , other, target] = configuration;
    const ids = (relRows[index].data ?? []).map((item) =>
      ss((item as Row)[other]),
    );
    selected[optionKeys[target]] = ids;
    return {
      target,
      items: (optionRows[target] as Row[]).filter((item) =>
        ids.includes(ss(item.id)),
      ),
    };
  });
  const moduleLabel =
    tab === "indicators" ? "IOC Workbench" : ctiModuleLabels[tab];
  const campaignReconstruction =
    tab === "campaigns"
      ? await supabase
          .from("campaign_reconstructions")
          .select("*")
          .eq("project_id", id)
          .eq("campaign_id", entityId)
          .maybeSingle()
      : { data: null };
  const campaignActivityQuery = supabase
    .from("campaign_timeline_events")
    .select(
      "*,timeline_events(*,timeline_event_entities(id),timeline_event_support(id))",
    )
    .eq("project_id", id)
    .eq("campaign_id", entityId);
  if (!showHistorical)
    campaignActivityQuery.in("status", ["POSSIBLE", "CONFIRMED"]);
  const campaignActivity =
    tab === "campaigns" ? await campaignActivityQuery : { data: [] };
  const campaignInfrastructureQuery = supabase
    .from("campaign_infrastructure_clusters")
    .select(
      "*,infrastructure_clusters(name,status,operational_relevance,infrastructure_cluster_members(count))",
    )
    .eq("project_id", id)
    .eq("campaign_id", entityId);
  if (!showHistorical)
    campaignInfrastructureQuery.in("status", ["POSSIBLE", "CONFIRMED"]);
  const campaignInfrastructure =
    tab === "campaigns" ? await campaignInfrastructureQuery : { data: [] };
  const availableClusters =
    tab === "campaigns"
      ? await supabase
          .from("infrastructure_clusters")
          .select("id,name")
          .eq("project_id", id)
          .is("archived_at", null)
      : { data: [] };
  const actorHypotheses =
    tab === "actors"
      ? await supabase
          .from("attribution_hypotheses")
          .select(
            "id,campaign_id,title,status,confidence,campaigns(name),campaign_attribution_assessments!campaign_attribution_assessments_preferred_hypothesis_id_fkey(id)",
          )
          .eq("project_id", id)
          .eq("threat_actor_id", entityId)
      : { data: [] };

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Link
        className="text-sm text-cyan-200"
        href={`/projects/${id}?tab=${tab}`}
      >
        ← Back to {moduleLabel}
      </Link>

      {tab === "indicators" ? (
        <IndicatorSummary row={row as Row} />
      ) : (
        <article className="card">
          <p className="text-sm text-slate-400">{ctiModuleLabels[tab]}</p>
          <h1 className="text-3xl font-bold text-white">
            {ctiRecordTitle(row as Row)}
          </h1>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {Object.entries(row as Row)
              .filter(([key]) => !["id", "project_id"].includes(key))
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs uppercase text-slate-500">
                    {key.replaceAll("_", " ")}
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm text-slate-200">
                    {Array.isArray(value)
                      ? aa(value).join(", ")
                      : typeof value === "object" && value
                        ? JSON.stringify(value, null, 2)
                        : ss(value)}
                  </dd>
                </div>
              ))}
          </dl>
        </article>
      )}

      {tab === "indicators" ? (
        <ObservationHistory
          rows={(observations ?? []) as Row[]}
          currentUserId={user.id}
        />
      ) : null}
      {tab === "campaigns" ? (
        <>
          <div className="flex justify-end">
            <Link
              className="rounded border border-stone-700 px-3 py-2 text-sm text-cyan-200"
              href={`/projects/${id}/campaigns/${entityId}${showHistorical ? "" : "?historical=1"}`}
            >
              {showHistorical
                ? "Hide historical relationships"
                : "Show historical relationships"}
            </Link>
          </div>
          <section className="card">
            <p className="citem-label">Reconstruction Summary</p>
            <h2 className="text-xl font-semibold">
              Current Campaign Reconstruction
            </h2>
            <p className="mt-2 text-sm text-stone-500">
              Campaign Reconstruction organises observed and inferred Timeline
              events into an analyst-controlled operational sequence.
              Reconstruction is not Threat Actor attribution.
            </p>
            <ReconstructionForm
              projectId={id}
              campaignId={entityId}
              row={(campaignReconstruction.data ?? {}) as Row}
            />
          </section>
          <section className="card">
            <h2 className="text-xl font-semibold">Ordered Activity</h2>
            <p className="text-sm text-stone-500">
              Event assessment status and Campaign membership status are
              distinct. Chronology uses event time; sequence order only assists
              ties.
            </p>
            <ol className="mt-3 grid gap-3">
              {visibleCampaignActivity(
                (campaignActivity.data ?? []) as Row[],
                showHistorical,
              ).map((m) => {
                const e = m.timeline_events as Row;
                return (
                  <li
                    className="rounded border border-stone-800 p-3"
                    key={ss(m.id)}
                  >
                    <Link
                      className="font-semibold text-cyan-200"
                      href={`/projects/${id}/timeline/${ss(m.timeline_event_id)}`}
                    >
                      {ss(e?.event_name)}
                    </Link>
                    <dl className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                      <div>
                        <dt className="citem-label">Timeline event status</dt>
                        <dd>{ss(e?.assessment_status)}</dd>
                      </div>
                      <div>
                        <dt className="citem-label">
                          Campaign membership status
                        </dt>
                        <dd>{ss(m.status)}</dd>
                      </div>
                    </dl>
                    <p>
                      {ss(e?.event_date)} · confidence {ss(m.confidence)}
                    </p>
                    <p>{ss(m.rationale)}</p>
                    <p className="text-xs text-stone-500">
                      {Array.isArray(e?.timeline_event_entities)
                        ? e.timeline_event_entities.length
                        : 0}{" "}
                      entities ·{" "}
                      {Array.isArray(e?.timeline_event_support)
                        ? e.timeline_event_support.length
                        : 0}{" "}
                      supporting records
                    </p>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="card">
            <h2 className="text-xl font-semibold">Infrastructure</h2>
            <ul className="mt-3">
              {((campaignInfrastructure.data ?? []) as Row[]).map((m) => {
                const c = m.infrastructure_clusters as Row;
                return (
                  <li key={ss(m.id)}>
                    <Link
                      className="text-cyan-200"
                      href={`/projects/${id}/infrastructure/${ss(m.infrastructure_cluster_id)}`}
                    >
                      {ss(c?.name)}
                    </Link>{" "}
                    — cluster {ss(c?.status)}, relationship {ss(m.status)} /{" "}
                    {ss(m.confidence)} — {ss(m.rationale)}
                    <p className="text-xs text-stone-500">
                      {ss(c?.operational_relevance)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <ClusterMembershipForm
              projectId={id}
              campaignId={entityId}
              clusters={(availableClusters.data ?? []) as Row[]}
            />
          </section>
          <section className="card">
            <h2 className="text-xl font-semibold">
              Supporting Events & Current Assessment
            </h2>
            <p>
              Supporting Sources, Evidence, and enrichment results remain
              authoritative at event level. Assess the coherent sequence,
              observed versus inferred activity, objective, infrastructure,
              activity status, disputes, likely next activity, and data still
              required. AI does not write this assessment.
            </p>
          </section>
        </>
      ) : null}

      {tab === "actors" ? (
        <section className="card">
          <h2 className="text-xl font-semibold">Attribution Hypotheses</h2>
          <p className="text-sm text-amber-200">
            Analytical hypothesis — not a confirmed Campaign relationship.
          </p>
          <ul className="mt-3 grid gap-2">
            {((actorHypotheses.data ?? []) as Row[]).map((h) => {
              const c = h.campaigns as Row;
              const preferred =
                Array.isArray(h.campaign_attribution_assessments) &&
                h.campaign_attribution_assessments.length > 0;
              return (
                <li key={ss(h.id)}>
                  <Link
                    className="text-cyan-200"
                    href={`/projects/${id}/campaigns/${ss(h.campaign_id)}/attribution/${ss(h.id)}`}
                  >
                    {ss(c?.name)} — {ss(h.title)}
                  </Link>{" "}
                  · {ss(h.status)} · {ss(h.confidence)}{" "}
                  {preferred ? "· CURRENTLY PREFERRED" : ""}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h2 className="font-semibold text-white">Related entities</h2>
        {related.map((group) => (
          <div key={group.target} className="mt-3">
            <h3 className="text-sm font-semibold text-cyan-200">
              {ctiModuleLabels[group.target]}
            </h3>
            {group.items.length ? (
              <ul className="list-disc pl-5 text-sm">
                {group.items.map((item) => (
                  <li key={ss(item.id)}>
                    <Link
                      className="text-slate-200 hover:text-cyan-200"
                      href={ctiDetailPath(id, group.target, ss(item.id))}
                    >
                      {ctiRecordTitle(item)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No linked records.</p>
            )}
          </div>
        ))}
      </section>
      <section className="card">
        <CtiForm
          tab={tab}
          projectId={id}
          row={row as Row}
          options={options}
          selected={selected}
        />
        <CtiDelete tab={tab} projectId={id} row={row as Row} />
      </section>
    </section>
  );
}
