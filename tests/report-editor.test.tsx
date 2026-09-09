import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportEditor } from "@/components/reports/report-editor";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

let fetchOk = true;
let fetchError = "Unable to save report.";
const fetchMock = vi.fn(async () => ({
  ok: fetchOk,
  json: async () =>
    fetchOk
      ? { ok: true, revision: 1, savedAt: "2026-08-22T14:00:00Z" }
      : { error: fetchError },
}));

const report = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "R1",
  type: "CTI",
  status: "DRAFT",
  draft_revision: 0,
  content: {
    type: "doc",
    attrs: { version: 1 },
    content: [{ type: "paragraph" }],
  },
};

describe("ReportEditor autosave and insertion behavior", () => {
  beforeEach(() => {
    push.mockClear();
    fetchOk = true;
    fetchError = "Unable to save report.";
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);

    const rects = [
      {
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    ] as unknown as DOMRectList;
    Element.prototype.getClientRects = vi.fn(() => rects);
    Range.prototype.getClientRects = vi.fn(() => rects);
    Range.prototype.getBoundingClientRect = vi.fn(() => rects[0] as DOMRect);
  });

  it("marks metadata changes unsaved and blocks exports until autosave completes", async () => {
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );

    await userEvent.type(screen.getByLabelText(/report title/i), " updated");

    expect(screen.getByText(/^Unsaved$/i)).toBeInTheDocument();
    expect(screen.getByText("Saving before PDF")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps navigation blocked when autosave fails", async () => {
    fetchOk = false;
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );

    await userEvent.type(screen.getByLabelText(/report title/i), " fail");
    await userEvent.click(screen.getByRole("button", { name: /reports/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /save failed.*retry/i })).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Saving before HTML")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("flushes pending autosave before returning to reports", async () => {
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );

    await userEvent.type(screen.getByLabelText(/report title/i), " changed");
    await userEvent.click(screen.getByRole("button", { name: /reports/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/p1/reports"));

    const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.title).toBe("R1 changed");
    expect(body.baseRevision).toBe(0);
  });

  it("inserts only displayed safe current-project metadata", async () => {
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{
          evidence: [
            {
              id: "e1",
              title: "Safe evidence",
              type: "URL",
              storage_path: "secret/path",
              upload_token: "secret",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Safe evidence")).toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Safe evidence"));
    expect(screen.getByText(/^Unsaved$/i)).toBeInTheDocument();
  });

  it("inserts Research Note content and CTI identifying fields", async () => {
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{
          research_notes: [
            {
              id: "n1",
              title: "Note title",
              content: "Observed behavior details",
            },
          ],
          indicators: [
            { id: "i1", value: "1.2.3.4", type: "IP", confidence: "HIGH" },
          ],
          cves: [{ id: "c1", cve_id: "CVE-2026-0001", severity: "HIGH" }],
          mitre_techniques: [
            {
              id: "m1",
              technique_id: "T1059",
              technique_name: "Command Shell",
              tactic: "Execution",
            },
          ],
        }}
      />,
    );

    await userEvent.click(screen.getByText("Note title"));
    await userEvent.click(screen.getByText("1.2.3.4"));

    expect(
      screen.getByText(/content: Observed behavior details/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/value: 1\.2\.3\.4/i)).toBeInTheDocument();
    expect(screen.getByText(/^Unsaved$/i)).toBeInTheDocument();
  });
});
