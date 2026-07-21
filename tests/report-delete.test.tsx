import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReportDeleteForm } from "@/components/reports/report-delete";
const result = {
  error: "Confirmation does not match the current report title.",
};
vi.mock("@/app/actions", () => ({ deleteReport: vi.fn(async () => result) }));
describe("ReportDeleteForm", () => {
  it("shows relationship impact and returned errors", async () => {
    render(
      <ReportDeleteForm
        projectId="p"
        reportId="r"
        title="Report"
        relationshipCount={2}
      />,
    );
    expect(
      screen.getByText(/2 manual Report graph relationships/i),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText(/confirm report title/i),
      "wrong",
    );
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Confirmation does not match/i,
    );
  });
});
