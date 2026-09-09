"use client";

import { ReportCreate } from "@/components/reports/report-create";
import { WorkspaceExplorer, type ExplorerFolder } from "@/components/document-workspace/workspace-explorer";

export type ReportWorkspaceRow = {
  id: string;
  folder_id: string | null;
  title: string;
  type: string;
  status: string;
  updated_at: string;
};

export function ReportsWorkspace({
  projectId,
  folders,
  reports,
}: {
  projectId: string;
  folders: ExplorerFolder[];
  reports: ReportWorkspaceRow[];
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-[#172016] shadow-2xl">
      <div className="grid min-h-[680px] md:grid-cols-[270px_minmax(0,1fr)]">
        <WorkspaceExplorer
          projectId={projectId}
          kind="REPORTS"
          folders={folders}
          documents={reports.map(({ id, folder_id, title }) => ({ id, folder_id, title }))}
          documentHref={(id) => `/projects/${projectId}/reports/${id}`}
        />
        <main className="min-w-0 p-8">
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-amber-400">INTELLIGENCE PRODUCTS</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Reports</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Open a report from the file explorer or create a new draft. Report content autosaves in the editor; versioning, publication and exports remain explicit actions.
            </p>
            <div className="mt-8 rounded-lg border border-slate-800 bg-slate-950/30 p-5">
              <h3 className="font-semibold text-slate-100">New report</h3>
              <ReportCreate projectId={projectId} />
            </div>
            {!!reports.length && (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {reports.slice(0, 8).map((report) => (
                  <a
                    key={report.id}
                    href={`/projects/${projectId}/reports/${report.id}`}
                    className="rounded-lg border border-slate-800 bg-slate-950/20 p-4 hover:border-amber-700/60"
                  >
                    <div className="truncate font-medium text-slate-100">{report.title}</div>
                    <div className="mt-2 text-xs text-slate-500">{report.type} · {report.status}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
