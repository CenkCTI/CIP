import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanvasDirectory } from "@/components/canvas/canvas-directory";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const projectId = "cfa15f31-d3e6-4ff1-8573-4416998c3800";
const canvasId = "9ae110d2-bfbd-449c-9b1c-4d4de63ee269";

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("CANVAS-1 directory", () => {
  it("renders an empty workspace without demo or Investigation records", () => {
    render(<CanvasDirectory projectId={projectId} canvases={[]} />);
    expect(screen.getByText(/No canvases yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New blank canvas" })).toBeInTheDocument();
    expect(screen.queryByText(/Threat Actor|Malware|Demo Data/i)).not.toBeInTheDocument();
  });

  it("creates only an empty board and navigates to it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ canvas: { id: canvasId } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CanvasDirectory projectId={projectId} canvases={[]} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Canvas name" }), {
      target: { value: "  Open questions  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "New blank canvas" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/projects/${projectId}/canvases`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Open questions" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/projects/${projectId}/canvas/${canvasId}`));
  });

  it("deletes only the canvas through the Canvas API", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CanvasDirectory projectId={projectId} canvases={[{
      id: canvasId, name: "Research", revision: 2, updated_at: "2026-11-05T12:00:00Z",
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete canvas" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${projectId}/canvases/${canvasId}`, { method: "DELETE" },
    ));
    expect(router.refresh).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
