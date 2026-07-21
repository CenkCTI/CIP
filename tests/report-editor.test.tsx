import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportEditor } from "@/components/reports/report-editor";
let actionResult: { success?: string; error?: string } = {
  success: "Report saved.",
};
vi.mock("@/app/actions", () => ({
  updateReport: vi.fn(async () => actionResult),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const report = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "R1",
  type: "CTI",
  status: "DRAFT",
  content: {
    type: "doc",
    attrs: { version: 1 },
    content: [{ type: "paragraph" }],
  },
};

describe("ReportEditor dirty and insertion behavior", () => {
  beforeEach(() => {
    actionResult = { success: "Report saved." };
    push.mockClear();
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
  it("marks metadata changes dirty and blocks exports until saved", async () => {
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/title/i), " updated");
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByText("Save before PDF")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
  it("keeps dirty on failed save", async () => {
    actionResult = { error: "Unable to save report." };
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/title/i), " fail");
    await userEvent.click(screen.getByRole("button", { name: /save report/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Error: Unable to save report/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Save before HTML")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
  it("normal back control asks for confirmation when dirty", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ReportEditor
        projectId="p1"
        report={report}
        insertables={{ evidence: [] }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/title/i), " changed");
    await userEvent.click(
      screen.getByRole("button", { name: /back to reports/i }),
    );
    expect(confirm).toHaveBeenCalledWith("Discard unsaved report changes?");
    expect(push).not.toHaveBeenCalled();
    confirm.mockRestore();
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
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Unsaved changes/i)).toBeInTheDocument();
  });
});
