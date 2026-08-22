import type { ReactNode } from "react";
import { WorkspaceExplorer, type ExplorerFolder } from "@/components/document-workspace/workspace-explorer";

export function ReportWorkspaceFrame({
  projectId,
  folders,
  reports,
  currentReportId,
  children,
}: {
  projectId: string;
  folders: ExplorerFolder[];
  reports: { id: string; folder_id: string | null; title: string }[];
  currentReportId: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1600px] overflow-hidden rounded-xl border border-slate-800 bg-[#172016] shadow-2xl">
      <div className="grid min-h-[680px] md:grid-cols-[270px_minmax(0,1fr)]">
        <WorkspaceExplorer
          projectId={projectId}
          kind="REPORTS"
          folders={folders}
          documents={reports}
          currentDocumentId={currentReportId}
          documentHref={(id) => `/projects/${projectId}/reports/${id}`}
        />
        <div className="min-w-0 bg-[#172016] px-4 py-5 lg:px-7">{children}</div>
      </div>
    </div>
  );
}
