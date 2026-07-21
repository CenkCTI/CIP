import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchableChecks } from "@/components/cti-forms";

vi.mock("@/app/actions", () => ({
  createCti: vi.fn(),
  updateCti: vi.fn(),
  deleteCti: vi.fn(),
}));

const rows = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Alpha" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Bravo" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Charlie" },
];
function hiddenValues(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLInputElement>(
      'input[type="hidden"][name="threat_actor_ids"]',
    ),
  ].map((input) => input.value);
}
describe("SearchableChecks", () => {
  it("keeps a selected relationship submitted while hidden by search", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SearchableChecks
        name="threat_actor_ids"
        rows={rows}
        selected={[String(rows[0].id)]}
      />,
    );
    await user.type(
      screen.getByPlaceholderText("Search relationships"),
      "Bravo",
    );
    expect(screen.queryByText("Alpha")).toBeNull();
    expect(hiddenValues(container)).toEqual([rows[0].id]);
  });
  it("newly selected relationships survive search changes", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SearchableChecks name="threat_actor_ids" rows={rows} selected={[]} />,
    );
    await user.click(screen.getByLabelText("Bravo"));
    await user.clear(screen.getByPlaceholderText("Search relationships"));
    await user.type(
      screen.getByPlaceholderText("Search relationships"),
      "Charlie",
    );
    expect(hiddenValues(container)).toEqual([rows[1].id]);
  });
  it("explicitly deselected relationships are absent", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SearchableChecks
        name="threat_actor_ids"
        rows={rows}
        selected={[String(rows[0].id), String(rows[1].id)]}
      />,
    );
    await user.click(screen.getByLabelText("Alpha"));
    expect(hiddenValues(container)).toEqual([rows[1].id]);
  });
  it("submits multiple selected IDs exactly once", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SearchableChecks
        name="threat_actor_ids"
        rows={rows}
        selected={[String(rows[0].id)]}
      />,
    );
    await user.click(screen.getByLabelText("Bravo"));
    await user.click(screen.getByLabelText("Bravo"));
    await user.click(screen.getByLabelText("Bravo"));
    expect(hiddenValues(container)).toEqual([rows[0].id, rows[1].id]);
  });
});
