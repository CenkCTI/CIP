import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { TimelineEdit } from "@/components/workspace-forms";
import {
  EntityLinkForm,
  EventMembershipForm,
  HistoricalMembershipUnlink,
  LinkedRecordUnlink,
  SupportLinkForms,
} from "@/components/reconstruction/forms";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");

function entityPresentation(projectId: string, link: Row) {
  if (link.indicator_id) {
    const record = link.indicators as Row;
    return { label: `${text(record?.value)} · ${text(record?.type)}`, href: `/projects/${projectId}/indicators/${text(link.indicator_id)}` };
  }
  if (link.infrastructure_cluster_id) {
    return { label: text((link.infrastructure_clusters as Row)?.name), href: `/projects/${projectId}/infrastructure/${text(link.infrastructure_cluster_id)}` };
  }
  if (link.malware_id) {
    return { label: text((link.malware as Row)?.name), href: `/projects/${projectId}/malware/${text(link.malware_id)}` };
  }
  if (link.cve_id) {
    return { label: text((link.cves as Row)?.cve_id), href: `/projects/${projectId}/cves/${text(link.cve_id)}` };
  }
  const technique = link.mitre_techniques as Row;
  return {
    label: `${text(technique?.technique_id)} · ${text(technique?.technique_name)}`,
    href: `/projects/${projectId}/mitre/${text(link.mitre_technique_id)}`,
  };
}

function supportPresentation(projectId: string, link: Row) {
  if (link.source_id) {
    return { type: "Source", label: text((link.sources as Row)?.title), href: `/projects/${projectId}/sources/${text(link.source_id)}` };
  }
  if (link.evidence_id) {
    return { type: "Evidence", label: text((link.evidence as Row)?.title), href: `/projects/${projectId}?tab=evidence#evidence-${text(link.evidence_id)}` };
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
  const parsedProject = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  const parsedEvent = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
  if (!parsedProject || !parsedEvent) notFound();

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

  const [members, entities, support, campaigns, indicators, clusters, malware, cves, mitre, sources, evidence, enrichment] = await Promise.all([
    context.supabase.from("campaign_timeline_events").select("*,campaigns(name)").eq("project_id", id).eq("timeline_event_id", eventId),
    context.supabase.from("timeline_event_entities").select("*,indicators(value,type),infrastructure_clusters(name),malware(name),cves(cve_id),mitre_techniques(technique_id,technique_name)").eq("project_id", id).eq("timeline_event_id", eventId),
    context.supabase.from("timeline_event_support").select("*,sources(title),evidence(title),enrichment_results(category,queried_at,indicator_id,enrichment_runs(provider_label_snapshot))").eq("project_id", id).eq("timeline_event_id", eventId),
    context.supabase.from("campaigns").select("id,name").eq("project_id", id),
    context.supabase.from("indicators").select("id,value,type").eq("project_id", id),
    context.supabase.from("infrastructure_clusters").select("id,name").eq("project_id", id),
    context.supabase.from("malware").select("id,name").eq("project_id", id),
    context.supabase.from("cves").select("id,cve_id").eq("project_id", id),
    context.supabase.from("mitre_techniques").select("id,technique_id,technique_name").eq("project_id", id),
    context.supabase.from("sources").select("id,title").eq("project_id", id),
    context.supabase.from("evidence").select("id,title").eq("project_id", id),
    context.supabase.from("enrichment_results").select("id,category,queried_at,enrichment_runs(provider_label_snapshot)").eq("project_id", id),
  ]);

  return (
    <main className="space-y-5">
      <Link className="text-cyan-200" href={`/projects/${id}?tab=timeline`}>← Timeline</Link>
      <section className="card">
        <p className="citem-label">Structured attack event</p>
        <h1 className="text-2xl font-semibold">{text(event.event_name)}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {[event.basis, event.activity_phase, event.assessment_status, event.confidence].map((value) => <span className="citem-badge" key={text(value)}>{text(value)}</span>)}
        </div>
        <p className="mt-3">Observed means supported by directly recorded material. Inferred means analyst judgement derived from other observations; it does not mean false.</p>
        <TimelineEdit projectId={id} event={event as Row} />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Campaign Membership</h2>
        <ul className="mt-3 grid gap-3">
          {(members.data ?? []).map((membership: Row) => (
            <li className="rounded border border-stone-800 p-3" key={text(membership.id)}>
              <Link className="text-cyan-200" href={`/projects/${id}/campaigns/${text(membership.campaign_id)}`}>{text((membership.campaigns as Row)?.name)}</Link>
              <p><strong>{text(membership.status)}</strong> · {text(membership.confidence)} · {text(membership.rationale)}</p>
              {["REJECTED", "REMOVED"].includes(text(membership.status)) ? <HistoricalMembershipUnlink projectId={id} eventId={eventId} membershipId={text(membership.id)} /> : null}
            </li>
          ))}
        </ul>
        <EventMembershipForm projectId={id} eventId={eventId} campaigns={(campaigns.data ?? []) as Row[]} />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Technical Entities</h2>
        <p className="text-sm text-stone-500">Only existing same-Investigation records can be linked. Threat Actors are intentionally excluded.</p>
        <ul className="mt-3 grid gap-3">
          {(entities.data ?? []).map((link: Row) => {
            const presentation = entityPresentation(id, link);
            return <li className="rounded border border-stone-800 p-3" key={text(link.id)}><Link className="text-cyan-200" href={presentation.href}>{presentation.label}</Link><p>{text(link.role)} · {text(link.analyst_note)}</p><LinkedRecordUnlink projectId={id} eventId={eventId} table="timeline_event_entities" recordId={text(link.id)} /></li>;
          })}
        </ul>
        <EntityLinkForm projectId={id} eventId={eventId} options={{ indicator: (indicators.data ?? []) as Row[], infrastructure_cluster: (clusters.data ?? []) as Row[], malware: (malware.data ?? []) as Row[], cve: (cves.data ?? []) as Row[], mitre_technique: (mitre.data ?? []) as Row[] }} />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Supporting Material</h2>
        <p className="text-sm text-stone-500">Sources open only through internal records; CİTEM never visits their external URLs.</p>
        <ul className="mt-3 grid gap-3">
          {(support.data ?? []).map((link: Row) => {
            const presentation = supportPresentation(id, link);
            return <li className="rounded border border-stone-800 p-3" key={text(link.id)}><Link className="text-cyan-200" href={presentation.href}>{presentation.type}: {presentation.label}</Link><p>{text(link.analyst_note)}</p><LinkedRecordUnlink projectId={id} eventId={eventId} table="timeline_event_support" recordId={text(link.id)} /></li>;
          })}
        </ul>
        <SupportLinkForms projectId={id} eventId={eventId} sources={(sources.data ?? []) as Row[]} evidence={(evidence.data ?? []) as Row[]} enrichment={(enrichment.data ?? []) as Row[]} />
      </section>

      <section className="card"><h2 className="text-lg font-semibold">Assessment prompts</h2><p>What happened? What was observed or inferred? Which technical elements participated? What supports the event? What remains uncertain? Which Campaign may it belong to, and how does it change the reconstruction?</p></section>
    </main>
  );
}
