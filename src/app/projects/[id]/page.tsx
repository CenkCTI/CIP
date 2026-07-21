import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProject, updateProject } from "@/app/actions";
import { ProjectForm } from "@/components/project-form";
import { CtiDelete, CtiForm } from "@/components/cti-forms";
import {
  DeleteEvidence,
  DeleteNote,
  DeleteTask,
  DeleteTimeline,
  EvidenceDownload,
  EvidenceEdit,
  EvidenceUpload,
  EvidenceUrlCreate,
  NoteCreate,
  NoteEdit,
  TaskCreate,
  TaskEdit,
  TaskMove,
  TimelineCreate,
  TimelineEdit,
} from "@/components/workspace-forms";
import { requireUser } from "@/lib/auth";
import type { Project } from "@/lib/projects/schema";
import {
  evidenceTypes,
  taskPriorities,
  taskStatuses,
} from "@/lib/workspace/schema";

type SP = {
  tab?: string;
  q?: string;
  tag?: string;
  sort?: string;
  type?: string;
  status?: string;
  priority?: string;
  deadline?: string;
  country?: string;
  motivation?: string;
  confidence?: string;
  severity?: string;
  exploit_status?: string;
  tactic?: string;
  actor?: string;
  family?: string;
  active?: string;
};
type Row = Record<string, unknown>;
const ss = (v: unknown) => String(v ?? "");
const aa = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const tabs = [
  "overview",
  "notes",
  "evidence",
  "timeline",
  "tasks",
  "actors",
  "campaigns",
  "indicators",
  "malware",
  "cves",
  "mitre",
];
function tagText(a: unknown) {
  return aa(a).join(", ");
}
function filtered(rows: Row[], sp: SP, fields: string[]) {
  let r = rows;
  const q = sp.q?.toLowerCase();
  if (q)
    r = r.filter(
      (x) =>
        fields.some((f) => ss(x[f]).toLowerCase().includes(q)) ||
        aa(x.tags).join(" ").toLowerCase().includes(q),
    );
  if (sp.tag) r = r.filter((x) => aa(x.tags).includes(sp.tag!));
  return r;
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = tabs.includes(sp.tab || "") ? sp.tab! : "overview";
  const { supabase } = await requireUser();
  const { data: project, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single<Project>();
  if (error || !project) notFound();
  const [
    { data: notes },
    { data: evidence },
    { data: events },
    { data: tasks },
    { data: actors },
    { data: campaigns },
    { data: indicators },
    { data: malware },
    { data: cves },
    { data: mitre },
    { data: campaignThreatActors },
    { data: threatActorMalware },
    { data: threatActorIndicators },
    { data: campaignMalware },
    { data: campaignIndicators },
    { data: malwareIndicators },
    { data: cveMalware },
    { data: threatActorMitre },
    { data: campaignMitre },
    { data: malwareMitre },
  ] = await Promise.all([
    supabase.from("research_notes").select("*").eq("project_id", id),
    supabase.from("evidence").select("*").eq("project_id", id),
    supabase.from("timeline_events").select("*").eq("project_id", id),
    supabase.from("project_tasks").select("*").eq("project_id", id),
    supabase.from("threat_actors").select("*").eq("project_id", id),
    supabase.from("campaigns").select("*").eq("project_id", id),
    supabase.from("indicators").select("*").eq("project_id", id),
    supabase.from("malware").select("*").eq("project_id", id),
    supabase.from("cves").select("*").eq("project_id", id),
    supabase.from("mitre_techniques").select("*").eq("project_id", id),
    supabase.from("campaign_threat_actors").select("*").eq("project_id", id),
    supabase.from("threat_actor_malware").select("*").eq("project_id", id),
    supabase.from("threat_actor_indicators").select("*").eq("project_id", id),
    supabase.from("campaign_malware").select("*").eq("project_id", id),
    supabase.from("campaign_indicators").select("*").eq("project_id", id),
    supabase.from("malware_indicators").select("*").eq("project_id", id),
    supabase.from("cve_malware").select("*").eq("project_id", id),
    supabase
      .from("threat_actor_mitre_techniques")
      .select("*")
      .eq("project_id", id),
    supabase.from("campaign_mitre_techniques").select("*").eq("project_id", id),
    supabase.from("malware_mitre_techniques").select("*").eq("project_id", id),
  ]);
  const ctiOptions = {
    threat_actor_ids: (actors ?? []) as Row[],
    campaign_ids: (campaigns ?? []) as Row[],
    indicator_ids: (indicators ?? []) as Row[],
    malware_ids: (malware ?? []) as Row[],
    cve_ids: (cves ?? []) as Row[],
    mitre_technique_ids: (mitre ?? []) as Row[],
  };
  const rels = {
    campaignThreatActors,
    threatActorMalware,
    threatActorIndicators,
    campaignMalware,
    campaignIndicators,
    malwareIndicators,
    cveMalware,
    threatActorMitre,
    campaignMitre,
    malwareMitre,
  } as Record<string, Row[] | null>;
  const mk = (t: string) => `/projects/${id}?tab=${t}`;
  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-bold text-white">{project.name}</h1>
      <nav className="mt-6 flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {tabs.map((t) => (
          <Link
            key={t}
            className={`rounded-t px-4 py-2 capitalize ${tab === t ? "bg-slate-800 text-cyan-200" : "text-slate-400 hover:text-white"}`}
            href={mk(t)}
          >
            {t}
          </Link>
        ))}
      </nav>
      {tab !== "overview" && <SearchBar id={id} tab={tab} />}{" "}
      {tab === "overview" && <Overview project={project} />}{" "}
      {tab === "notes" && (
        <Notes
          id={id}
          rows={filtered((notes ?? []) as Row[], sp, ["title", "content"]).sort(
            (a, b) =>
              sp.sort === "title"
                ? ss(a.title).localeCompare(ss(b.title))
                : ss(b.updated_at).localeCompare(ss(a.updated_at)),
          )}
        />
      )}{" "}
      {tab === "evidence" && (
        <Evidence
          id={project.id}
          rows={filtered(
            ((evidence ?? []) as Row[]).filter(
              (e) => !sp.type || ss(e.type) === sp.type,
            ),
            sp,
            ["title", "description", "source_url"],
          ).sort((a, b) =>
            sp.sort === "title"
              ? ss(a.title).localeCompare(ss(b.title))
              : ss(b.collection_date).localeCompare(ss(a.collection_date)),
          )}
        />
      )}{" "}
      {tab === "timeline" && (
        <Timeline
          id={id}
          rows={filtered((events ?? []) as Row[], sp, [
            "event_name",
            "description",
          ]).sort((a, b) => ss(a.event_date).localeCompare(ss(b.event_date)))}
        />
      )}{" "}
      {tab === "tasks" && (
        <Tasks
          id={id}
          ownerId={project.owner_id}
          rows={filtered(
            ((tasks ?? []) as Row[]).filter(
              (t) =>
                (!sp.status || ss(t.status) === sp.status) &&
                (!sp.priority || ss(t.priority) === sp.priority) &&
                (!sp.deadline || Boolean(t.deadline)),
            ),
            sp,
            ["task_name", "description"],
          )}
        />
      )}{" "}
      {tab === "actors" && (
        <CtiList
          tab="actors"
          id={id}
          rows={ctiFilter(
            (actors ?? []) as Row[],
            sp,
            ["name", "country", "description", "known_ttps"],
            (r) =>
              (!sp.country || ss(r.country) === sp.country) &&
              (!sp.motivation || aa(r.motivations).includes(sp.motivation)),
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "campaigns" && (
        <CtiList
          tab="campaigns"
          id={id}
          rows={ctiFilter(
            (campaigns ?? []) as Row[],
            sp,
            ["name", "description"],
            (r) =>
              !sp.active ||
              !r.end_date ||
              new Date(ss(r.end_date)) >= new Date(),
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "indicators" && (
        <CtiList
          tab="indicators"
          id={id}
          rows={ctiFilter(
            (indicators ?? []) as Row[],
            sp,
            ["value", "source"],
            (r) =>
              (!sp.type || ss(r.type) === sp.type) &&
              (!sp.confidence || ss(r.confidence) === sp.confidence) &&
              (!sp.tag || aa(r.tags).includes(sp.tag)),
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "malware" && (
        <CtiList
          tab="malware"
          id={id}
          rows={ctiFilter(
            (malware ?? []) as Row[],
            sp,
            ["name", "family", "behavior"],
            (r) => !sp.family || ss(r.family) === sp.family,
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "cves" && (
        <CtiList
          tab="cves"
          id={id}
          rows={ctiFilter(
            (cves ?? []) as Row[],
            sp,
            ["cve_id", "affected_product", "description"],
            (r) =>
              (!sp.severity || ss(r.severity) === sp.severity) &&
              (!sp.exploit_status ||
                ss(r.exploit_status) === sp.exploit_status),
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "mitre" && (
        <CtiList
          tab="mitre"
          id={id}
          rows={ctiFilter(
            (mitre ?? []) as Row[],
            sp,
            ["technique_id", "technique_name", "tactic"],
            (r) =>
              (!sp.tactic || ss(r.tactic) === sp.tactic) &&
              (!sp.type || ss(r.technique_id).startsWith(sp.type!)),
          )}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
    </section>
  );
}
function SearchBar({ id, tab }: { id: string; tab: string }) {
  return (
    <form className="my-4 flex flex-wrap gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input className="field max-w-xs" name="q" placeholder="Search" />
      <input className="field max-w-40" name="tag" placeholder="Tag filter" />
      <select className="field max-w-40" name="sort">
        <option value="">Default sort</option>
        <option value="title">Title</option>
      </select>
      {tab === "evidence" && (
        <select className="field max-w-40" name="type">
          <option value="">All types</option>
          {evidenceTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
      {tab === "tasks" && (
        <>
          <select className="field max-w-40" name="status">
            <option value="">All statuses</option>
            {taskStatuses.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="field max-w-40" name="priority">
            <option value="">All priorities</option>
            {taskPriorities.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="field max-w-40" name="deadline">
            <option value="">Any deadline</option>
            <option value="set">Has deadline</option>
          </select>
        </>
      )}
      <button className="rounded-lg border border-slate-700 px-3">Apply</button>
      <Link
        className="px-3 py-2 text-sm text-slate-400"
        href={`/projects/${id}?tab=${tab}`}
      >
        Clear
      </Link>
    </form>
  );
}
function Overview({ project }: { project: Project }) {
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="card">
        <h2 className="mb-4 font-semibold text-white">Edit project</h2>
        <ProjectForm
          action={updateProject.bind(null, project.id)}
          project={project}
        />
      </div>
      <div className="card">
        <h2 className="font-semibold text-red-200">Delete project</h2>
        <p className="mt-2 text-sm text-slate-400">
          Type the project name to confirm: {project.name}
        </p>
        <form
          action={deleteProject.bind(null, project.id, project.name)}
          className="mt-4 space-y-3"
        >
          <input className="field" name="confirm" />
          <button className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
function Notes({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <div className="grid gap-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">New research note</h2>
        <NoteCreate projectId={id} />
      </div>
      {rows.length ? (
        rows.map((n) => (
          <article className="card" key={ss(n.id)}>
            <h3 className="font-semibold text-white">{ss(n.title)}</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-300">
              {ss(n.content)}
            </p>
            <p className="text-xs text-slate-500">
              {tagText(n.tags)} · updated{" "}
              {new Date(ss(n.updated_at)).toLocaleString()}
            </p>
            <NoteEdit projectId={id} note={n} />
            <DeleteNote projectId={id} id={ss(n.id)} />
          </article>
        ))
      ) : (
        <p className="card text-slate-400">
          No research notes match this view.
        </p>
      )}
    </div>
  );
}
function Evidence({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <EvidenceUpload projectId={id} />
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">New URL evidence</h2>
        <EvidenceUrlCreate projectId={id} />
      </div>
      <div className="lg:col-span-2 grid gap-4">
        {rows.length ? (
          rows.map((e) => (
            <article className="card" key={ss(e.id)}>
              <h3 className="font-semibold text-white">
                {ss(e.title)}{" "}
                <span className="text-xs text-cyan-200">{ss(e.type)}</span>
              </h3>
              <p className="text-sm text-slate-300">{ss(e.description)}</p>
              <p className="text-xs text-slate-500">
                {ss(e.original_file_name || e.source_url)} · {ss(e.mime_type)} ·{" "}
                {ss(e.file_size)} bytes · {tagText(e.tags)}
              </p>
              <EvidenceDownload projectId={id} id={ss(e.id)} />
              <EvidenceEdit projectId={id} evidence={e} />
              <DeleteEvidence projectId={id} id={ss(e.id)} />
            </article>
          ))
        ) : (
          <p className="card text-slate-400">No evidence matches this view.</p>
        )}
      </div>
    </div>
  );
}
function Timeline({ id, rows }: { id: string; rows: Row[] }) {
  return (
    <div className="grid gap-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">New timeline event</h2>
        <TimelineCreate projectId={id} />
      </div>
      <ol className="border-l border-cyan-900 pl-4">
        {rows.length ? (
          rows.map((e) => (
            <li className="card mb-4" key={ss(e.id)}>
              <time className="text-cyan-200">
                {new Date(ss(e.event_date)).toLocaleString()}
              </time>
              <h3 className="font-semibold text-white">{ss(e.event_name)}</h3>
              <p>{ss(e.description)}</p>
              <TimelineEdit projectId={id} event={e} />
              <DeleteTimeline projectId={id} id={ss(e.id)} />
            </li>
          ))
        ) : (
          <li className="card text-slate-400">
            No timeline events match this view.
          </li>
        )}
      </ol>
    </div>
  );
}
function Tasks({
  id,
  rows,
  ownerId,
}: {
  id: string;
  rows: Row[];
  ownerId: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="card">
        <h2 className="mb-3 font-semibold text-white">New task</h2>
        <TaskCreate projectId={id} ownerId={ownerId} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {taskStatuses.map((status) => (
          <section className="card" key={status}>
            <h2 className="font-semibold text-white">
              {status.replace("_", " ")}
            </h2>
            {rows
              .filter((t) => ss(t.status) === status)
              .map((t) => (
                <article
                  className="mt-3 rounded border border-slate-800 p-3"
                  key={ss(t.id)}
                >
                  <h3>{ss(t.task_name)}</h3>
                  <p className="text-sm text-slate-400">{ss(t.description)}</p>
                  <p className="text-xs text-slate-500">
                    {ss(t.priority)}
                    {ss(t.deadline) &&
                      ` · due ${new Date(ss(t.deadline)).toLocaleDateString()}`}
                    {ss(t.deadline) &&
                    new Date(ss(t.deadline)) < new Date() &&
                    ss(t.status) !== "COMPLETED"
                      ? " · OVERDUE"
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {taskStatuses
                      .filter((x) => x !== ss(t.status))
                      .map((x) => (
                        <TaskMove
                          key={x}
                          projectId={id}
                          id={ss(t.id)}
                          status={x}
                        />
                      ))}
                  </div>
                  <TaskEdit projectId={id} task={t} ownerId={ownerId} />
                  <DeleteTask projectId={id} id={ss(t.id)} />
                </article>
              ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ctiFilter(
  rows: Row[],
  sp: SP,
  fields: string[],
  extra: (r: Row) => boolean,
) {
  return filtered(rows.filter(extra), sp, fields).sort((a, b) =>
    sp.sort === "created"
      ? ss(b.created_at).localeCompare(ss(a.created_at))
      : ss(a.name || a.value || a.cve_id || a.technique_id).localeCompare(
          ss(b.name || b.value || b.cve_id || b.technique_id),
        ),
  );
}
function CtiList({
  tab,
  id,
  rows,
  options,
  rels,
}: {
  tab: "actors" | "campaigns" | "indicators" | "malware" | "cves" | "mitre";
  id: string;
  rows: Row[];
  options: Record<string, Row[]>;
  rels: Record<string, Row[] | null>;
}) {
  return (
    <div className="grid gap-4">
      <div className="card">
        <CtiForm tab={tab} projectId={id} options={options} />
      </div>
      {rows.length ? (
        rows.map((r) => (
          <article className="card" id={ss(r.id)} key={ss(r.id)}>
            <h3 className="font-semibold text-white">
              {ss(r.name || r.value || r.cve_id || r.technique_id)}{" "}
              <span className="text-xs text-cyan-200">
                {ss(r.type || r.severity || r.tactic || r.family)}
              </span>
            </h3>
            <p className="whitespace-pre-wrap text-sm text-slate-300">
              {ss(r.description || r.behavior || r.known_ttps)}
            </p>
            <p className="text-xs text-slate-500">
              Updated{" "}
              {ss(r.updated_at)
                ? new Date(ss(r.updated_at)).toLocaleString()
                : ""}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-cyan-200">
                Edit details and relationships
              </summary>
              <CtiForm
                tab={tab}
                projectId={id}
                row={r}
                options={options}
                selected={selectedFor(tab, ss(r.id), rels)}
              />
              <CtiDelete tab={tab} projectId={id} row={r} />
            </details>
          </article>
        ))
      ) : (
        <p className="card text-slate-400">No CTI records match this view.</p>
      )}
    </div>
  );
}

function selectedFor(
  tab: string,
  id: string,
  rels: Record<string, Row[] | null>,
): Record<string, string[]> {
  const pick = (rows: Row[] | null | undefined, self: string, other: string) =>
    (rows ?? []).filter((r) => ss(r[self]) === id).map((r) => ss(r[other]));
  const empty = {
    threat_actor_ids: [],
    campaign_ids: [],
    indicator_ids: [],
    malware_ids: [],
    cve_ids: [],
    mitre_technique_ids: [],
  };
  if (tab === "actors")
    return {
      ...empty,
      malware_ids: pick(
        rels.threatActorMalware,
        "threat_actor_id",
        "malware_id",
      ),
      indicator_ids: pick(
        rels.threatActorIndicators,
        "threat_actor_id",
        "indicator_id",
      ),
      mitre_technique_ids: pick(
        rels.threatActorMitre,
        "threat_actor_id",
        "mitre_technique_id",
      ),
    };
  if (tab === "campaigns")
    return {
      ...empty,
      threat_actor_ids: pick(
        rels.campaignThreatActors,
        "campaign_id",
        "threat_actor_id",
      ),
      malware_ids: pick(rels.campaignMalware, "campaign_id", "malware_id"),
      indicator_ids: pick(
        rels.campaignIndicators,
        "campaign_id",
        "indicator_id",
      ),
      mitre_technique_ids: pick(
        rels.campaignMitre,
        "campaign_id",
        "mitre_technique_id",
      ),
    };
  if (tab === "indicators")
    return {
      ...empty,
      threat_actor_ids: pick(
        rels.threatActorIndicators,
        "indicator_id",
        "threat_actor_id",
      ),
      campaign_ids: pick(
        rels.campaignIndicators,
        "indicator_id",
        "campaign_id",
      ),
      malware_ids: pick(rels.malwareIndicators, "indicator_id", "malware_id"),
    };
  if (tab === "malware")
    return {
      ...empty,
      threat_actor_ids: pick(
        rels.threatActorMalware,
        "malware_id",
        "threat_actor_id",
      ),
      campaign_ids: pick(rels.campaignMalware, "malware_id", "campaign_id"),
      indicator_ids: pick(rels.malwareIndicators, "malware_id", "indicator_id"),
      cve_ids: pick(rels.cveMalware, "malware_id", "cve_id"),
      mitre_technique_ids: pick(
        rels.malwareMitre,
        "malware_id",
        "mitre_technique_id",
      ),
    };
  if (tab === "cves")
    return {
      ...empty,
      malware_ids: pick(rels.cveMalware, "cve_id", "malware_id"),
    };
  return {
    ...empty,
    threat_actor_ids: pick(
      rels.threatActorMitre,
      "mitre_technique_id",
      "threat_actor_id",
    ),
    campaign_ids: pick(rels.campaignMitre, "mitre_technique_id", "campaign_id"),
    malware_ids: pick(rels.malwareMitre, "mitre_technique_id", "malware_id"),
  };
}
