import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteTimeline } from "@/components/workspace-forms";
import { TimelineEventModal } from "@/components/timeline/timeline-event-modal";
import {
  QuickAnnotationUnlink,
  QuickCampaignLink,
  QuickEntityLink,
  QuickHistoricalMembershipUnlink,
  QuickRecordUnlink,
  QuickSupportLink,
} from "@/components/timeline/timeline-advanced-links";
import { requireUser } from "@/lib/auth";
import {
  annotationPageLabel,
  timelinePhaseLabel,
  timelineTimeLabel,
} from "@/lib/timeline/presentation";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function entityPresentation(projectId: string, link: Row) {
  if (link.indicator_id) {
    const record = link.indicators as Row;
    return {
      label: `${text(record?.value)} · ${text(record?.type)}`,
      href: `/projects/${projectId}/indicators/${text(link.indicator_id)}`,
    };
  }
  if (link.infrastructure_cluster_id) {
    return {
      label: text((link.infrastructure_clusters as Row)?.name),
      href: `/projects/${projectId}/infrastructure/${text(link.infrastructure_cluster_id)}`,
    };
  }
  if (link.malware_id) {
    return {
      label: text((link.malware as Row)?.name),
      href: `/projects/${projectId}/malware/${text(link.malware_id)}`,
    };
  }
  if (link.cve_id) {
    return {
      label: text((link.cves as Row)?.cve_id),
      href: `/projects/${projectId}/cves/${text(link.cve_id)}`,
    };
  }
  const technique = link.mitre_techniques as Row;
  return {
    label: `${text(technique?.technique_id)} · ${text(technique?.technique_name)}`,
    href: `/projects/${projectId}/mitre/${text(link.mitre_technique_id)}`,
  };
}

function supportPresentation(projectId: string, link: Row) {
  if (link.source_id) {
    return {
      type: "Source",
      label: text((link.sources as Row)?.title),
      href: `/projects/${projectId}/sources/${text(link.source_id)}`,
    };
  }
  if (link.evidence_id) {
    return {
      type: "Evidence",
      label: text((link.evidence as Row)?.title),
      href: `/projects/${projectId}?tab=evidence&view=evidence#evidence-${text(link.evidence_id)}`,
    };
  }
  const result = link.enrichment_results as Row;
  const run = result?.enrichment_runs as Row;
  return {
    type: "Enrichment",
    label: `${text(run?.provider_label_snapshot || result?.category)} · ${text(result?.queried_at)}`,
    href: `/projects/${projectId}/indicators/${text(result?.indicator_id)}#enrichment-history`,
  };
}

export default async function TimelineEventPage({
  params,
}: {
  params: Promise<{ id: string; eventId: string }>;
}) {
  const { id, eventId } = await params;
  const context = await requireUser();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !uuid.test(eventId)) notFound();

  const { data: project } = await context.supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!project || project.owner_id !== context.user.id) notFound();

  const { data: event } = await context.supabase
    .from("timeline_events")
    .select("*")
    .eq("project_id", id)
    .eq("id", eventId)
    .maybeSingle();
  if (!event) notFound();

  const [
    members,
    entities,
    support,
    campaigns,
    indicators,
    clusters,
    malware,
    cves,
    mitre,
    sources,
    evidence,
    enrichment,
    annotationLinks,
  ] = await Promise.all([
    context.supabase
      .from("campaign_timeline_events")
      .select("*,campaigns(name)")
      .eq("project_id", id)
      .eq("timeline_event_id", eventId),
    context.supabase
      .from("timeline_event_entities")
      .select("*,indicators(value,type),infrastructure_clusters(name),malware(name),cves(cve_id),mitre_techniques(technique_id,technique_name)")
      .eq("project_id", id)
      .eq("timeline_event_id", eventId),
    context.supabase
      .from("timeline_event_support")
      .select("*,sources(title),evidence(title),enrichment_results(category,queried_at,indicator_id,enrichment_runs(provider_label_snapshot))")
      .eq("project_id", id)
      .eq("timeline_event_id", eventId),
    context.supabase.from("campaigns").select("id,name").eq("project_id", id).order("name"),
    context.supabase.from("indicators").select("id,value,type").eq("project_id", id),
    context.supabase.from("infrastructure_clusters").select("id,name").eq("project_id", id),
    context.supabase.from("malware").select("id,name").eq("project_id", id),
    context.supabase.from("cves").select("id,cve_id").eq("project_id", id),
    context.supabase.from("mitre_techniques").select("id,technique_id,technique_name").eq("project_id", id),
    context.supabase.from("sources").select("id,title").eq("project_id", id),
    context.supabase.from("evidence").select("id,title").eq("project_id", id),
    context.supabase
      .from("enrichment_results")
      .select("id,category,queried_at,enrichment_runs(provider_label_snapshot)")
      .eq("project_id", id),
    context.supabase
      .from("timeline_event_source_annotations")
      .select("id,source_annotation_id")
      .eq("project_id", id)
      .eq("timeline_event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);

  const failed = [
    members.error,
    entities.error,
    support.error,
    campaigns.error,
    indicators.error,
    clusters.error,
    malware.error,
    cves.error,
    mitre.error,
    sources.error,
    evidence.error,
    enrichment.error,
    annotationLinks.error,
  ].find(Boolean);
  if (failed) {
    return (
      <main className="mx-auto max-w-6xl">
        <div className="card text-red-300">Unable to load Timeline event details.</div>
      </main>
    );
  }

  const annotationIds = (annotationLinks.data ?? []).map((row) => row.source_annotation_id);
  const annotationsResult = annotationIds.length
    ? await context.supabase
        .from("source_annotations")
        .select("id,source_id,page_number,selected_text,comment,annotation_type")
        .eq("project_id", id)
        .in("id", annotationIds)
    : { data: [] as Row[], error: null };
  const fragmentsResult = annotationIds.length
    ? await context.supabase
        .from("source_annotation_fragments")
        .select("annotation_id,page_number")
        .eq("project_id", id)
        .in("annotation_id", annotationIds)
    : { data: [] as Row[], error: null };

  if (annotationsResult.error || fragmentsResult.error) {
    return (
      <main className="mx-auto max-w-6xl">
        <div className="card text-red-300">Unable to load Timeline source provenance.</div>
      </main>
    );
  }

  const sourceById = new Map((sources.data ?? []).map((row: Row) => [text(row.id), row]));
  const annotationById = new Map(
    (annotationsResult.data ?? []).map((row: Row) => [text(row.id), row]),
  );

  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <Link className="text-sm text-amber-300" href={`/projects/${id}?tab=timeline`}>
        ← Timeline
      </Link>

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="citem-label">Timeline event</p>
            <time className="mt-2 block font-mono text-xs uppercase tracking-[0.12em] text-amber-300">
              {timelineTimeLabel(event as Row)}
            </time>
            <h1 className="mt-1 text-2xl font-semibold text-stone-100">{text(event.event_name)}</h1>
            {event.description ? (
              <p className="mt-3 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-stone-400">
                {text(event.description)}
              </p>
            ) : null}
          </div>
          <TimelineEventModal projectId={id} event={event as Row} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="citem-badge">{timelinePhaseLabel(event.basis)}</span>
          {event.activity_phase && event.activity_phase !== "UNKNOWN" ? (
            <span className="citem-badge" data-tone="attention">{timelinePhaseLabel(event.activity_phase)}</span>
          ) : null}
          {event.assessment_status && event.assessment_status !== "RECORDED" ? (
            <span className="citem-badge">{timelinePhaseLabel(event.assessment_status)}</span>
          ) : null}
          {event.basis === "INFERRED" ? (
            <span className="citem-badge">Confidence · {timelinePhaseLabel(event.confidence)}</span>
          ) : null}
        </div>

        {event.analyst_rationale ? (
          <div className="mt-4 rounded border border-stone-800 bg-black/10 p-3">
            <p className="citem-label">Analyst rationale</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-400">{text(event.analyst_rationale)}</p>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="citem-label">Source trace</p>
            <h2 className="mt-1 text-lg font-semibold text-stone-100">Exact source provenance</h2>
          </div>
          <p className="text-xs text-stone-600">
            Source annotations preserve the passage that produced this event.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          {(annotationLinks.data ?? []).map((link: Row) => {
            const annotation = annotationById.get(text(link.source_annotation_id));
            if (!annotation) return null;
            const source = sourceById.get(text(annotation.source_id));
            return (
              <article className="rounded border border-amber-900/35 bg-amber-950/10 p-3" key={text(link.id)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      className="text-sm font-medium text-amber-300 hover:text-amber-200"
                      href={`/projects/${id}/sources/${text(annotation.source_id)}?annotation=${text(annotation.id)}`}
                    >
                      {text(source?.title) || "Source"}
                    </Link>
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-stone-600">
                      {annotationPageLabel(annotation, (fragmentsResult.data ?? []) as Row[])} · {timelinePhaseLabel(annotation.annotation_type)}
                    </p>
                  </div>
                  <QuickAnnotationUnlink projectId={id} eventId={eventId} linkId={text(link.id)} />
                </div>
                {annotation.selected_text ? (
                  <blockquote className="mt-3 border-l-2 border-amber-700/70 pl-3 text-sm leading-6 text-stone-400">
                    {text(annotation.selected_text)}
                  </blockquote>
                ) : annotation.comment ? (
                  <p className="mt-3 text-sm text-stone-400">{text(annotation.comment)}</p>
                ) : null}
              </article>
            );
          })}
          {!(annotationLinks.data ?? []).length ? (
            <p className="rounded border border-dashed border-stone-800 p-4 text-sm text-stone-600">
              No source annotation is linked yet. Add one directly from the PDF reader.
            </p>
          ) : null}
        </div>
      </section>

      <details className="card">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="citem-label">Advanced connections</p>
              <h2 className="mt-1 text-lg font-semibold text-stone-100">Campaign, technical and supporting records</h2>
            </div>
            <span className="text-sm text-amber-300">Open controls ▾</span>
          </div>
        </summary>

        <div className="mt-5 grid gap-5">
          <section className="rounded border border-stone-800 bg-black/10 p-4">
            <div className="mb-3">
              <p className="citem-label">Campaigns</p>
              <p className="mt-1 text-sm text-stone-500">
                Membership is an analyst judgement. Quick links begin as possible / low confidence.
              </p>
            </div>
            {(members.data ?? []).length ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {(members.data ?? []).map((membership: Row) => (
                  <div className="rounded border border-stone-800 bg-[#101518] px-3 py-2 text-sm" key={text(membership.id)}>
                    <Link className="text-amber-300" href={`/projects/${id}/campaigns/${text(membership.campaign_id)}`}>
                      {text((membership.campaigns as Row)?.name)}
                    </Link>
                    <p className="mt-1 text-xs text-stone-500">
                      {timelinePhaseLabel(membership.status)} · {timelinePhaseLabel(membership.confidence)}
                    </p>
                    {membership.rationale ? <p className="mt-1 text-xs text-stone-600">{text(membership.rationale)}</p> : null}
                    {["REJECTED", "REMOVED"].includes(text(membership.status)) ? (
                      <div className="mt-2">
                        <QuickHistoricalMembershipUnlink
                          projectId={id}
                          eventId={eventId}
                          membershipId={text(membership.id)}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <QuickCampaignLink projectId={id} eventId={eventId} campaigns={(campaigns.data ?? []) as Row[]} />
          </section>

          <section className="rounded border border-stone-800 bg-black/10 p-4">
            <div className="mb-3">
              <p className="citem-label">Technical records</p>
              <p className="mt-1 text-sm text-stone-500">
                Link existing same-Investigation records. Default roles are derived from the record type.
              </p>
            </div>
            {(entities.data ?? []).length ? (
              <div className="mb-4 grid gap-2 md:grid-cols-2">
                {(entities.data ?? []).map((link: Row) => {
                  const presentation = entityPresentation(id, link);
                  return (
                    <div className="flex items-start justify-between gap-3 rounded border border-stone-800 bg-[#101518] p-3" key={text(link.id)}>
                      <div>
                        <Link className="text-sm text-amber-300" href={presentation.href}>{presentation.label}</Link>
                        <p className="mt-1 text-xs text-stone-600">{timelinePhaseLabel(link.role)}</p>
                      </div>
                      <QuickRecordUnlink
                        projectId={id}
                        eventId={eventId}
                        table="timeline_event_entities"
                        recordId={text(link.id)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
            <QuickEntityLink
              projectId={id}
              eventId={eventId}
              options={{
                indicator: (indicators.data ?? []) as Row[],
                infrastructure_cluster: (clusters.data ?? []) as Row[],
                malware: (malware.data ?? []) as Row[],
                cve: (cves.data ?? []) as Row[],
                mitre_technique: (mitre.data ?? []) as Row[],
              }}
            />
          </section>

          <section className="rounded border border-stone-800 bg-black/10 p-4">
            <div className="mb-3">
              <p className="citem-label">Supporting material</p>
              <p className="mt-1 text-sm text-stone-500">
                Attach broader Source, Evidence or enrichment records when passage-level annotation is not enough.
              </p>
            </div>
            {(support.data ?? []).length ? (
              <div className="mb-4 grid gap-2 md:grid-cols-2">
                {(support.data ?? []).map((link: Row) => {
                  const presentation = supportPresentation(id, link);
                  return (
                    <div className="flex items-start justify-between gap-3 rounded border border-stone-800 bg-[#101518] p-3" key={text(link.id)}>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-stone-600">{presentation.type}</p>
                        <Link className="text-sm text-amber-300" href={presentation.href}>{presentation.label}</Link>
                      </div>
                      <QuickRecordUnlink
                        projectId={id}
                        eventId={eventId}
                        table="timeline_event_support"
                        recordId={text(link.id)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
            <QuickSupportLink
              projectId={id}
              eventId={eventId}
              sources={(sources.data ?? []) as Row[]}
              evidence={(evidence.data ?? []) as Row[]}
              enrichment={(enrichment.data ?? []) as Row[]}
            />
          </section>

          <section className="rounded border border-red-950/50 bg-red-950/5 p-4">
            <p className="citem-label">Danger zone</p>
            <p className="mt-1 mb-3 text-sm text-stone-600">
              Active Campaign memberships can block deletion to preserve reconstruction history.
            </p>
            <DeleteTimeline projectId={id} id={eventId} />
          </section>
        </div>
      </details>
    </main>
  );
}
