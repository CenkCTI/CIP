import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDeleteForm } from "@/components/reports/report-delete";
import { ReportEditor } from "@/components/reports/report-editor";
import { requireUser } from "@/lib/auth";
import { parseJsonDoc } from "@/lib/reports/schema";
import { reportInsertSources } from "@/lib/reports/insert-sources";

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
    reportInsertSources.map(([t, select]) =>
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
    reportInsertSources.map(([t], i) => [
      t,
      (results[i].data ?? []) as unknown as Row[],
    ]),
  );
  const { count: relationshipCount, error: relationshipCountError } =
    await supabase
      .from("entity_relationships")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .or(
        `and(source_type.eq.REPORT,source_id.eq.${reportId}),and(target_type.eq.REPORT,target_id.eq.${reportId})`,
      );
  if (relationshipCountError)
    return (
      <section className="mx-auto max-w-6xl">
        <Link
          href={`/projects/${id}?tab=reports`}
          className="text-sm text-cyan-300"
        >
          ← Reports
        </Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load Report relationship impact. Refresh and try again.
        </div>
      </section>
    );
  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="mt-3 text-3xl font-bold text-white">Edit report</h1>
      <ReportEditor
        projectId={id}
        report={{ ...(report as Row), content: parsed.data }}
        insertables={insertables}
      />
      <div className="card mt-6 border-red-900/60">
        <h2 className="font-semibold text-red-200">Delete report</h2>
        <p className="mt-2 text-sm text-slate-400">
          Type the current report title to confirm: {String(report.title)}
        </p>
        <ReportDeleteForm
          projectId={id}
          reportId={reportId}
          title={String(report.title)}
          relationshipCount={relationshipCount ?? 0}
        />
      </div>
    </section>
  );
}
