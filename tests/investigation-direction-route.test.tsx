import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, notFound } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  notFound,
}));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/components/investigations/direction-workspace", () => ({
  InvestigationDirectionWorkspace: ({ project }: { project: { name: string } }) => <h1>{project.name}</h1>,
}));
vi.mock("@/components/project-form", () => ({ ProjectForm: () => null }));
vi.mock("@/components/osint/linked-osint", () => ({ LinkedOsint: () => null }));

import Page from "@/app/projects/[id]/page";

const project = { id: "investigation-1", name: "Test Investigation" };

function renderRoute(searchParams: { tab?: string } = {}) {
  return Page({
    params: Promise.resolve({ id: project.id }),
    searchParams: Promise.resolve(searchParams),
  });
}

describe("Investigation root", () => {
  const single = vi.fn();
  const eq = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    single.mockResolvedValue({ data: project, error: null });
    eq.mockImplementation(() =>
      Object.assign(Promise.resolve({ data: [], error: null }), { single, order: eq }),
    );
    from.mockReturnValue({ select: () => ({ eq }) });
    requireUser.mockResolvedValue({ supabase: { from } });
  });

  it("mounts the existing Direction workspace after the project lookup", async () => {
    render(await renderRoute());

    expect(requireUser).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledExactlyOnceWith("projects");
    expect(eq).toHaveBeenCalledExactlyOnceWith("id", project.id);
    expect(screen.getByRole("region", { name: "Intelligence Direction" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: project.name })).toBeInTheDocument();
  });

  it("continues to serve the existing Overview for its explicit tab", async () => {
    render(await renderRoute({ tab: "overview" }));

    expect(screen.getByRole("heading", { name: "Edit project" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Intelligence Direction" })).not.toBeInTheDocument();
  });

  it("returns not-found before rendering Direction when the project is inaccessible", async () => {
    single.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });

    await expect(renderRoute()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
