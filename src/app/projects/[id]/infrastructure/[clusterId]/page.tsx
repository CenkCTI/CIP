import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import {
  attachSupport,
  saveMember,
  setClusterArchived,
  unlinkSupport,
  updateCluster,
} from "../../infrastructure-actions";
import { KnowledgeGraph } from "@/components/graph/knowledge-graph";
import { ClusterFields } from "@/components/infrastructure/infrastructure-workspace";
import {
  confidenceLevels,
  indicatorRoles,
  label,
  memberStatuses,
} from "@/lib/infrastructure/schema";
import { requireOwnedProject } from "@/lib/projects/ownership";

type Row = Record<string, unknown>;
type SupportKind = "source" | "evidence" | "enrichment";
const stringValue = (value: unknown) => String(value ?? "");

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; clusterId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, clusterId } = await params;
  const query = await searchParams;
  if (!z.string().uuid().safeParse(clusterId).success) notFound();

  let context: Awaited<ReturnType<typeof requireOwnedProject>>;
  try {
    context = await requireOwnedProject(id);
  } catch {
    notFound();
  }

  const [
    clusterResult,
    membersResult,
    indicatorsResult,
    supportResult,
    sourcesResult,
    evidenceResult,
    resultsResult,
  ] = await Promise.all([
    context.supabase
      .from("infrastructure_clusters")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("id", clusterId)
      .single(),
    context.supabase
      .from("infrastructure_cluster_members")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("cluster_id", clusterId)
      .order("created_at"),
    context.supabase
      .from("indicators")
      .select("id,value,type")
      .eq("project_id", context.projectId)
      .order("normalized_value"),
    context.supabase
      .from("infrastructure_cluster_support")
      .select("*")
      .eq("project_id", context.projectId)
      .eq("cluster_id", clusterId)
      .order("created_at"),
    context.supabase
      .from("sources")
      .select("id,title")
      .eq("project_id", context.projectId)
      .order("title"),
    context.supabase
      .from("evidence")
      .select("id,title")
      .eq("project_id", context.projectId)
      .order("title"),
    context.supabase
      .from("enrichment_results")
      .select("id,category,indicator_id,created_at")
      .eq("project_id", context.projectId)
      .order("created_at", { ascending: false }),
  ]);
  if (clusterResult.error || !clusterResult.data) notFound();
  if (
    membersResult.error ||
    indicatorsResult.error ||
    supportResult.error ||
    sourcesResult.error ||
    evidenceResult.error ||
    resultsResult.error
  ) {
    throw new Error("Infrastructure Cluster details could not be loaded.");
  }

  const cluster = clusterResult.data as Row;
  const members = (membersResult.data ?? []) as Row[];
  const indicators = (indicatorsResult.data ?? []) as Row[];
  const supports = (supportResult.data ?? []) as Row[];
  const sources = (sourcesResult.data ?? []) as Row[];
  const evidence = (evidenceResult.data ?? []) as Row[];
  const results = (resultsResult.data ?? []) as Row[];
  const indicatorById = new Map(
    indicators.map((indicator) => [stringValue(indicator.id), indicator]),
  );
  const memberById = new Map(
    members.map((member) => [stringValue(member.id), member]),
  );

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <Link className="text-cyan-200" href={`/projects/${id}?tab=infrastructure`}>
        ← Infrastructure
      </Link>
      <div className="flex justify-between">
        <h1 className="text-3xl font-bold">{stringValue(cluster.name)}</h1>
        <form
          action={setClusterArchived.bind(
            null,
            id,
            clusterId,
            !cluster.archived_at,
          )}
        >
          <button className="btn">
            {cluster.archived_at ? "Restore" : "Archive"}
          </button>
        </form>
      </div>
      {query.error ? <p className="card text-red-300">{query.error}</p> : null}
      <nav className="flex flex-wrap gap-3 text-cyan-200">
        <a href="#summary">Summary</a>
        <a href="#members">Members</a>
        <a href="#support">Supporting Material</a>
        <a href="#assessment">Assessment</a>
        <a href="#graph">Graph</a>
      </nav>

      <section id="summary" className="card">
        <h2 className="text-xl font-bold">Summary &amp; Assessment</h2>
        <p className="mb-4 text-sm text-slate-400">
          An analyst assessment of shared infrastructure—not an attribution claim.
        </p>
        <form
          action={updateCluster.bind(null, id, clusterId)}
          className="space-y-3"
        >
          <ClusterFields cluster={cluster} />
          <button className="btn">Save summary and assessment</button>
        </form>
      </section>

      <section id="members" className="space-y-3">
        <h2 className="text-xl font-bold">Members</h2>
        <MemberForm
          action={saveMember.bind(null, id, clusterId, null)}
          indicators={indicators.filter(
            (indicator) =>
              !members.some((member) => member.indicator_id === indicator.id),
          )}
        />
        {members.map((member) => {
          const indicator = indicatorById.get(stringValue(member.indicator_id));
          return (
            <article className="card" key={stringValue(member.id)}>
              <div className="flex justify-between">
                <Link
                  className="font-bold text-cyan-200"
                  href={`/projects/${id}/indicators/${member.indicator_id}`}
                >
                  {stringValue(indicator?.value)}
                </Link>
                <span>
                  {label(stringValue(member.status))} ·{" "}
                  {label(stringValue(member.role))}
                </span>
              </div>
              <p className="text-sm text-slate-400">
                {stringValue(indicator?.type)} · {stringValue(member.confidence)}{" "}
                confidence ·{" "}
                {supports.filter(
                  (support) => support.cluster_member_id === member.id,
                ).length} supports
              </p>
              <p>{stringValue(member.rationale)}</p>
              <p className="text-xs">
                {stringValue(member.first_observed_at) || "—"} →{" "}
                {stringValue(member.last_observed_at) || "—"}
              </p>
              <details>
                <summary>Edit / reject / remove / restore</summary>
                <MemberForm
                  action={saveMember.bind(
                    null,
                    id,
                    clusterId,
                    stringValue(member.id),
                  )}
                  indicators={indicator ? [indicator] : []}
                  member={member}
                />
              </details>
            </article>
          );
        })}
      </section>

      <section id="support" className="card space-y-4">
        <h2 className="text-xl font-bold">Supporting Material</h2>
        <p className="text-sm text-slate-400">
          Choose one same-Investigation record. Source links open the internal Source
          detail only; CİTEM does not visit external URLs.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <SupportForm
            action={attachSupport.bind(null, id, clusterId)}
            kind="source"
            title="Attach Source"
            members={members}
            records={sources}
          />
          <SupportForm
            action={attachSupport.bind(null, id, clusterId)}
            kind="evidence"
            title="Attach Evidence"
            members={members}
            records={evidence}
          />
          <SupportForm
            action={attachSupport.bind(null, id, clusterId)}
            kind="enrichment"
            title="Attach enrichment result"
            members={members}
            records={results}
          />
        </div>
        {supports.map((support) => {
          const navigation = supportNavigation(
            id,
            support,
            sources,
            evidence,
            results,
          );
          const member = memberById.get(stringValue(support.cluster_member_id));
          const attachedIndicator = indicatorById.get(
            stringValue(member?.indicator_id),
          );
          return (
            <div className="border-t border-slate-700 pt-3" key={stringValue(support.id)}>
              <Link className="font-bold text-cyan-200" href={navigation.href}>
                {navigation.kind}: {navigation.label}
              </Link>
              <p>{stringValue(support.note)}</p>
              <p className="text-xs">
                {support.cluster_member_id
                  ? `Membership: ${stringValue(attachedIndicator?.value)}`
                  : "Cluster-wide"}{" "}
                · {stringValue(support.created_at)}
              </p>
              <form
                action={unlinkSupport.bind(
                  null,
                  id,
                  clusterId,
                  stringValue(support.id),
                )}
              >
                <button className="text-red-300">Unlink</button>
              </form>
            </div>
          );
        })}
      </section>

      <section id="assessment" className="card">
        <h2 className="text-xl font-bold">Assessment guide</h2>
        <ul className="list-disc pl-5 text-slate-300">
          <li>What common infrastructure do these Indicators form?</li>
          <li>What role does each Indicator play?</li>
          <li>What supporting material exists and what remains uncertain?</li>
          <li>Is the infrastructure active, and why is it operationally relevant?</li>
        </ul>
      </section>
      <section id="graph">
        <h2 className="mb-3 text-xl font-bold">Graph</h2>
        <KnowledgeGraph projectId={id} />
      </section>
    </section>
  );
}

function MemberForm({
  action,
  indicators,
  member,
}: {
  action: (formData: FormData) => void | Promise<void>;
  indicators: Row[];
  member?: Row;
}) {
  return (
    <form action={action} className="card grid gap-2 md:grid-cols-2">
      <label>
        Existing Indicator
        <select
          className="field"
          name="indicator_id"
          required
          defaultValue={stringValue(member?.indicator_id)}
        >
          {indicators.map((indicator) => (
            <option
              key={stringValue(indicator.id)}
              value={stringValue(indicator.id)}
            >
              {stringValue(indicator.value)} · {stringValue(indicator.type)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select
          className="field"
          name="role"
          defaultValue={stringValue(member?.role) || "UNKNOWN"}
        >
          {indicatorRoles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          className="field"
          name="status"
          defaultValue={stringValue(member?.status) || "POSSIBLE"}
        >
          {memberStatuses.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
      </label>
      <label>
        Confidence
        <select
          className="field"
          name="confidence"
          defaultValue={stringValue(member?.confidence) || "MEDIUM"}
        >
          {confidenceLevels.map((confidence) => (
            <option key={confidence}>{confidence}</option>
          ))}
        </select>
      </label>
      <label>
        First observed
        <input
          className="field"
          type="datetime-local"
          name="first_observed_at"
          defaultValue={stringValue(member?.first_observed_at).slice(0, 16)}
        />
      </label>
      <label>
        Last observed
        <input
          className="field"
          type="datetime-local"
          name="last_observed_at"
          defaultValue={stringValue(member?.last_observed_at).slice(0, 16)}
        />
      </label>
      <label className="md:col-span-2">
        Rationale
        <textarea
          className="field"
          required
          name="rationale"
          maxLength={10_000}
          defaultValue={stringValue(member?.rationale)}
        />
      </label>
      <button className="btn md:col-span-2">
        {member ? "Save membership" : "Add existing Indicator"}
      </button>
    </form>
  );
}

function SupportForm({
  action,
  kind,
  title,
  members,
  records,
}: {
  action: (formData: FormData) => void | Promise<void>;
  kind: SupportKind;
  title: string;
  members: Row[];
  records: Row[];
}) {
  return (
    <form action={action} className="rounded border border-slate-700 p-3">
      <h3 className="font-bold">{title}</h3>
      <input type="hidden" name="kind" value={kind} />
      <label>
        Attach to
        <select className="field" name="cluster_member_id">
          <option value="">Cluster overall</option>
          {members.map((member) => (
            <option key={stringValue(member.id)} value={stringValue(member.id)}>
              Membership {stringValue(member.id).slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {title.replace("Attach ", "")}
        <select className="field" name="target_id" required>
          <option value="">Select a record</option>
          {records.map((record) => (
            <option key={stringValue(record.id)} value={stringValue(record.id)}>
              {supportRecordLabel(kind, record)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Analyst note
        <textarea className="field" name="note" maxLength={5_000} />
      </label>
      <button className="btn" disabled={records.length === 0}>
        {title}
      </button>
    </form>
  );
}

function supportRecordLabel(kind: SupportKind, record: Row) {
  if (kind === "enrichment") {
    return `${stringValue(record.category)} · ${stringValue(record.created_at)}`;
  }
  return stringValue(record.title);
}

function supportNavigation(
  projectId: string,
  support: Row,
  sources: Row[],
  evidence: Row[],
  results: Row[],
) {
  if (support.source_id) {
    const source = sources.find((item) => item.id === support.source_id);
    return {
      kind: "Source",
      label: stringValue(source?.title || "Source"),
      href: `/projects/${projectId}/sources/${support.source_id}`,
    };
  }
  if (support.evidence_id) {
    const item = evidence.find((record) => record.id === support.evidence_id);
    return {
      kind: "Evidence",
      label: stringValue(item?.title || "Evidence"),
      href: `/projects/${projectId}?tab=evidence#evidence-${support.evidence_id}`,
    };
  }
  const result = results.find(
    (record) => record.id === support.enrichment_result_id,
  );
  return {
    kind: "Enrichment result",
    label: stringValue(result?.category || "Enrichment history"),
    href: `/projects/${projectId}/indicators/${result?.indicator_id ?? ""}#enrichment`,
  };
}
