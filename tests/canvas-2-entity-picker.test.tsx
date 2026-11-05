import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanvasEntityPicker } from "@/components/canvas/canvas-entity-picker";
import type { CanvasEntitySummary } from "@/lib/canvas/entity-registry";

const projectId = "f53bcdeb-fc38-4d77-bd59-c3450bd4fa02";
const item: CanvasEntitySummary = {
  recordType: "ACTOR",
  recordId: "a838132d-90e1-4144-ae56-d48c62417c56",
  title: "APT sample", summary: "Research entity", originKind: "ANALYST_ENTITY",
  href: `/projects/${projectId}/actors/a838132d-90e1-4144-ae56-d48c62417c56`,
  updatedAt: "2026-11-05T12:00:00Z",
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("CANVAS-2 record picker", () => {
  it("loads only Investigation records, then adds the selected typed reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ items: [item], hasMore: false, page: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onAdd = vi.fn();
    render(<CanvasEntityPicker projectId={projectId} onAdd={onAdd} onClose={vi.fn()} />);
    expect(await screen.findByText("APT sample")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toContain(`/api/projects/${projectId}/canvases/entities?`);
    fireEvent.click(screen.getByRole("button", { name: "Place" }));
    expect(onAdd).toHaveBeenCalledWith(item);
  });

  it("supports type-filtered searching and keyboard dismissal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ items: [], hasMore: false, page: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<CanvasEntityPicker projectId={projectId} onAdd={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Filter record type" }), {
      target: { value: "SOURCE_CLAIM" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Search Investigation records" }), {
      target: { value: "shared evidence" },
    });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) =>
        String(url).includes("type=SOURCE_CLAIM") && String(url).includes("q=shared+evidence")
      )).toBe(true);
    }, { timeout: 2500 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("surfaces unavailability rather than inventing a record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    render(<CanvasEntityPicker projectId={projectId} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByRole("button", { name: "Place" })).not.toBeInTheDocument();
  });
});
