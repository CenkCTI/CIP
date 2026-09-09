import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportsWorkspace, type ReportWorkspaceRow } from "@/components/reports/reports-workspace";
import type { ExplorerFolder } from "@/components/document-workspace/workspace-explorer";
import { requireUser } from "@/lib/auth";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,owner_id")
    .eq("id", id)
    .single();
  if (projectError || !project || project.owner_id !== user.id) notFound();

  const [{ data: folders, error: foldersError }, { data: reports, error: reportsError }] =
    await Promise.all([
      supabase
        .from("workspace_folders")
        .select("id,parent_id,name,kind")
        .eq("project_id", id)
        .eq("kind", "REPORTS")
        .order("name"),
      supabase
        .from("reports")
        .select("id,folder_id,title,type,status,updated_at")
        .eq("project_id", id)
        .order("title"),
    ]);

  if (foldersError || reportsError)
    return (
      <section className="mx-auto max-w-6xl">
        <Link href={`/projects/${id}`} className="text-sm text-amber-300">← Investigation</Link>
        <div className="card mt-4 text-red-300" role="alert">
          Unable to load Reports workspace. Apply migration 052 and refresh.
        </div>
      </section>
    );

  return (
    <section className="mx-auto max-w-[1500px] px-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Link href={`/projects/${id}`} className="text-sm text-amber-300 hover:text-amber-200">← Investigation</Link>
          <h1 className="mt-2 text-3xl font-bold text-white">{project.name} · Reports</h1>
        </div>
        <p className="hidden text-xs text-slate-500 sm:block">Folders · products · explicit versioning</p>
      </div>
      <ReportsWorkspace
        projectId={id}
        folders={(folders ?? []) as unknown as ExplorerFolder[]}
        reports={(reports ?? []) as unknown as ReportWorkspaceRow[]}
      />
    </section>
  );
}
