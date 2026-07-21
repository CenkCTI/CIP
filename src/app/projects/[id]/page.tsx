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
import { ctiDetailPath } from "@/lib/cti-schema";
import {
  filterActors,
  filterCampaigns,
  filterCves,
  filterIndicators,
  filterMalware,
  filterMitre,
  type CtiSearchParams,
} from "@/lib/cti-filters";
import type { Project } from "@/lib/projects/schema";
import {
  evidenceTypes,
  taskPriorities,
  taskStatuses,
} from "@/lib/workspace/schema";

type SP = CtiSearchParams & {
  tab?: string;
  status?: string;
  priority?: string;
  deadline?: string;
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
    { data: notes, error: notesError },
    { data: evidence, error: evidenceError },
    { data: events, error: eventsError },
    { data: tasks, error: tasksError },
    { data: actors, error: actorsError },
    { data: campaigns, error: campaignsError },
    { data: indicators, error: indicatorsError },
    { data: malware, error: malwareError },
    { data: cves, error: cvesError },
    { data: mitre, error: mitreError },
    { data: campaignThreatActors, error: campaignThreatActorsError },
    { data: threatActorMalware, error: threatActorMalwareError },
    { data: threatActorIndicators, error: threatActorIndicatorsError },
    { data: campaignMalware, error: campaignMalwareError },
    { data: campaignIndicators, error: campaignIndicatorsError },
    { data: malwareIndicators, error: malwareIndicatorsError },
    { data: cveMalware, error: cveMalwareError },
    { data: threatActorMitre, error: threatActorMitreError },
    { data: campaignMitre, error: campaignMitreError },
    { data: malwareMitre, error: malwareMitreError },
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

  const moduleLoadError = [
    notesError,
    evidenceError,
    eventsError,
    tasksError,
    actorsError,
    campaignsError,
    indicatorsError,
    malwareError,
    cvesError,
    mitreError,
    campaignThreatActorsError,
    threatActorMalwareError,
    threatActorIndicatorsError,
    campaignMalwareError,
    campaignIndicatorsError,
    malwareIndicatorsError,
    cveMalwareError,
    threatActorMitreError,
    campaignMitreError,
    malwareMitreError,
  ].find(Boolean);
  if (moduleLoadError)
    return (
      <section className="mx-auto max-w-6xl">
        <div className="card text-red-300">
          Unable to load this project module. Please refresh and try again.
        </div>
      </section>
    );
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
      {tab !== "overview" && (
        <SearchBar
          id={id}
          tab={tab}
          sp={sp}
          actors={(actors ?? []) as Row[]}
          campaigns={(campaigns ?? []) as Row[]}
        />
      )}{" "}
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
          rows={filterActors((actors ?? []) as Row[], sp)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "campaigns" && (
        <CtiList
          tab="campaigns"
          id={id}
          rows={filterCampaigns((campaigns ?? []) as Row[], sp, rels)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "indicators" && (
        <CtiList
          tab="indicators"
          id={id}
          rows={filterIndicators((indicators ?? []) as Row[], sp)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "malware" && (
        <CtiList
          tab="malware"
          id={id}
          rows={filterMalware((malware ?? []) as Row[], sp, rels)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "cves" && (
        <CtiList
          tab="cves"
          id={id}
          rows={filterCves((cves ?? []) as Row[], sp)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
      {tab === "mitre" && (
        <CtiList
          tab="mitre"
          id={id}
          rows={filterMitre((mitre ?? []) as Row[], sp)}
          options={ctiOptions}
          rels={rels}
        />
      )}{" "}
    </section>
  );
}
function SearchBar({
  id,
  tab,
  sp,
  actors,
  campaigns,
}: {
  id: string;
  tab: string;
  sp: SP;
  actors: Row[];
  campaigns: Row[];
}) {
  return (
    <form className="my-4 flex flex-wrap gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input
        className="field max-w-xs"
        name="q"
        placeholder="Search"
        defaultValue={sp.q ?? ""}
      />
      <input
        className="field max-w-40"
        name="tag"
        placeholder="Tag filter"
        defaultValue={sp.tag ?? ""}
      />
      <select
        className="field max-w-40"
        name="sort"
        defaultValue={sp.sort ?? ""}
      >
        <option value="">Default sort</option>
        <option value="title">Title</option>
        <option value="created">Newest</option>
        <option value="id">ID tie-break</option>
      </select>
      {tab === "evidence" && (
        <select className="field max-w-40" name="type">
          <option value="">All types</option>
          {evidenceTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      )}
      {tab === "actors" && (
        <>
          <input
            className="field max-w-40"
            name="country"
            defaultValue={sp.country ?? ""}
            placeholder="Country"
          />
          <input
            className="field max-w-40"
            name="motivation"
            defaultValue={sp.motivation ?? ""}
            placeholder="Motivation"
          />
        </>
      )}
      {tab === "campaigns" && (
        <>
          <select
            className="field max-w-40"
            name="active"
            defaultValue={sp.active ?? ""}
          >
            <option value="">Any active state</option>
            <option value="true">Active/no end</option>
          </select>
          <input
            className="field max-w-40"
            name="start"
            defaultValue={sp.start ?? ""}
            type="date"
            aria-label="Start after"
          />
          <input
            className="field max-w-40"
            name="end"
            defaultValue={sp.end ?? ""}
            type="date"
            aria-label="End before"
          />
          <select
            className="field max-w-48"
            name="actor"
            defaultValue={sp.actor ?? ""}
          >
            <option value="">Any actor</option>
            {actors.map((a) => (
              <option key={ss(a.id)} value={ss(a.id)}>
                {ss(a.name)}
              </option>
            ))}
          </select>
        </>
      )}
      {tab === "indicators" && (
        <>
          <select
            className="field max-w-40"
            name="type"
            defaultValue={sp.type ?? ""}
          >
            <option value="">All types</option>
            {["IP", "DOMAIN", "URL", "HASH", "EMAIL", "FILE", "REGISTRY"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
          <select
            className="field max-w-40"
            name="confidence"
            defaultValue={sp.confidence ?? ""}
          >
            <option value="">Any confidence</option>
            {["LOW", "MEDIUM", "HIGH"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            className="field max-w-40"
            name="first"
            defaultValue={sp.first ?? ""}
            type="date"
            aria-label="First seen after"
          />
          <input
            className="field max-w-40"
            name="last"
            defaultValue={sp.last ?? ""}
            type="date"
            aria-label="Last seen before"
          />
        </>
      )}
      {tab === "malware" && (
        <>
          <input
            className="field max-w-40"
            name="family"
            defaultValue={sp.family ?? ""}
            placeholder="Family"
          />
          <select
            className="field max-w-48"
            name="actor"
            defaultValue={sp.actor ?? ""}
          >
            <option value="">Any actor</option>
            {actors.map((a) => (
              <option key={ss(a.id)} value={ss(a.id)}>
                {ss(a.name)}
              </option>
            ))}
          </select>
          <select
            className="field max-w-48"
            name="campaign"
            defaultValue={sp.campaign ?? ""}
          >
            <option value="">Any campaign</option>
            {campaigns.map((c) => (
              <option key={ss(c.id)} value={ss(c.id)}>
                {ss(c.name)}
              </option>
            ))}
          </select>
        </>
      )}
      {tab === "cves" && (
        <>
          <select
            className="field max-w-40"
            name="severity"
            defaultValue={sp.severity ?? ""}
          >
            <option value="">Any severity</option>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className="field max-w-40"
            name="exploit_status"
            defaultValue={sp.exploit_status ?? ""}
          >
            <option value="">Any exploit status</option>
            {["NONE", "POC", "WEAPONIZED", "ACTIVE_EXPLOITATION"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </>
      )}
      {tab === "mitre" && (
        <>
          <input
            className="field max-w-40"
            name="tactic"
            defaultValue={sp.tactic ?? ""}
            placeholder="Tactic"
          />
          <input
            className="field max-w-40"
            name="type"
            defaultValue={sp.type ?? ""}
            placeholder="Technique ID"
          />
        </>
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
              <Link
                className="hover:text-cyan-200"
                href={ctiDetailPath(id, tab, ss(r.id))}
              >
                {ss(r.name || r.value || r.cve_id || r.technique_id)}
              </Link>{" "}
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
