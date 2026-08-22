import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ReportWorkspaceFrame } from "@/components/reports/report-workspace-frame";
import type { ExplorerFolder } from "@/components/document-workspace/workspace-explorer";
import { requireUser } from "@/lib/auth";

export default async function ReportDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const { supabase, user } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id,owner_id")
    .eq("id", id)
    .single();
  if (!project || project.owner_id !== user.id) notFound();

  const [{ data: folders, error: folderError }, { data: reports, error: reportError }] =
    await Promise.all([
      supabase
        .from("workspace_folders")
        .select("id,parent_id,name,kind")
        .eq("project_id", id)
        .eq("kind", "REPORTS")
        .order("name"),
      supabase
        .from("reports")
        .select("id,folder_id,title")
        .eq("project_id", id)
        .order("title"),
    ]);

  if (folderError || reportError) return <>{children}</>;

  return (
    <ReportWorkspaceFrame
      projectId={id}
      folders={(folders ?? []) as unknown as ExplorerFolder[]}
      reports={(reports ?? []) as unknown as { id: string; folder_id: string | null; title: string }[]}
      currentReportId={reportId}
    >
      {children}
    </ReportWorkspaceFrame>
  );
}
