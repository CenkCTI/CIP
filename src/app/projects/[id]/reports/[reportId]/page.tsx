import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteReport } from "@/app/actions";
import { ReportEditor } from "@/components/reports/report-editor";
import { requireUser } from "@/lib/auth";

type Row = Record<string, unknown>;
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
  const tables = [
    "research_notes",
    "evidence",
    "timeline_events",
    "project_tasks",
    "threat_actors",
    "campaigns",
    "indicators",
    "malware",
    "cves",
    "mitre_techniques",
  ] as const;
  const results = await Promise.all(
    tables.map((t) =>
      supabase.from(t).select("*").eq("project_id", id).limit(100),
    ),
  );
  const insertables = Object.fromEntries(
    tables.map((t, i) => [t, (results[i].data ?? []) as Row[]]),
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
        report={report as Row}
        insertables={insertables}
      />
      <div className="card mt-6 border-red-900/60">
        <h2 className="font-semibold text-red-200">Delete report</h2>
        <p className="mt-2 text-sm text-slate-400">
          Type the report title to confirm: {String(report.title)}
        </p>
        <form
          action={deleteReport.bind(null, id, reportId, String(report.title))}
          className="mt-3 flex gap-2"
        >
          <input className="field" name="confirm" />
          <button className="rounded-lg bg-red-500 px-4 py-2 font-semibold text-white">
            Delete
          </button>
        </form>
      </div>
    </section>
  );
}
