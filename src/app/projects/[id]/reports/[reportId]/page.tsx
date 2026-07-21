import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteReport } from "@/app/actions";
import { ReportEditor } from "@/components/reports/report-editor";
import { requireUser } from "@/lib/auth";
import { parseJsonDoc } from "@/lib/reports/schema";

type Row = Record<string, unknown>;
const sources = [
  ["research_notes", "id,title,content,updated_at"],
  [
    "evidence",
    "id,title,type,description,source_url,collection_date,tags,created_at",
  ],
  ["timeline_events", "id,event_name,description,event_date,created_at"],
  [
    "project_tasks",
    "id,task_name,description,status,priority,deadline,updated_at",
  ],
  [
    "threat_actors",
    "id,name,aliases,country,motivations,description,updated_at",
  ],
  ["campaigns", "id,name,description,start_date,end_date,targets,updated_at"],
  ["indicators", "id,value,type,confidence,source,tags,first_seen,last_seen"],
  ["malware", "id,name,family,description,behavior,updated_at"],
  [
    "cves",
    "id,cve_id,severity,description,affected_product,exploit_status,updated_at",
  ],
  [
    "mitre_techniques",
    "id,technique_id,technique_name,tactic,description,updated_at",
  ],
] as const;
export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id,name,owner_id")
    .eq("id", id)
    .single();
  if (!project || project.owner_id !== user.id) notFound();
  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("project_id", id)
    .eq("id", reportId)
    .single();
  if (error || !report) notFound();
  const parsed = parseJsonDoc(report.content);
  if (!parsed.success)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          This report contains invalid structured content and cannot be opened
          until the stored document is repaired.
        </div>
      </section>
    );
  const results = await Promise.all(
    sources.map(([t, select]) =>
      supabase
        .from(t)
        .select(select)
        .eq("project_id", id)
        .order("id", { ascending: true })
        .limit(100),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load safe project insertion metadata. Refresh and try again.
        </div>
      </section>
    );
  const insertables = Object.fromEntries(
    sources.map(([t], i) => [t, (results[i].data ?? []) as unknown as Row[]]),
  );
  return (
    <section className="mx-auto max-w-6xl">
      <Link
        href={`/projects/${id}?tab=reports`}
        className="text-sm text-cyan-300"
      >
        ← Reports
      </Link>
      <h1 className="mt-3 text-3xl font-bold text-white">Edit report</h1>
      <ReportEditor
        projectId={id}
        report={{ ...(report as Row), content: parsed.data }}
        insertables={insertables}
      />
      <div className="card mt-6 border-red-900/60">
        <h2 className="font-semibold text-red-200">Delete report</h2>
        <p className="mt-2 text-sm text-slate-400">
          Type the current report title to confirm deletion and cleanup of
          Report graph relationships: {String(report.title)}
        </p>
        <form
          action={async (fd) => {
            await deleteReport(id, reportId, String(report.title), fd);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            className="field"
            name="confirm"
            aria-label="Confirm report title"
          />
          <button className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white">
            Delete
          </button>
        </form>
      </div>
    </section>
  );
}
