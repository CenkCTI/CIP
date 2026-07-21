import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const authorizeEvidenceUploadMock = vi.fn<(...args: unknown[]) => Promise<{ path?: string; token?: string; error?: string }>>(async () => ({ path: `user/${PROJECT_ID}/uuid-proof.pdf`, token: "token" }));
const finalizeEvidenceUploadMock = vi.fn<(...args: unknown[]) => Promise<{ success?: string; error?: string }>>(async () => ({ success: "Evidence saved." }));
const createUrlEvidenceMock = vi.fn(async () => ({ success: "Evidence saved." }));
const uploadToSignedUrlMock = vi.fn<(...args: unknown[]) => Promise<{ error: null | { message: string } }>>(async () => ({ error: null }));

vi.mock("@/app/actions", () => ({
  authorizeEvidenceUpload: authorizeEvidenceUploadMock,
  finalizeEvidenceUpload: finalizeEvidenceUploadMock,
  createUrlEvidence: createUrlEvidenceMock,
  createNote: vi.fn(),
  createTask: vi.fn(),
  createTimelineEvent: vi.fn(),
  deleteEvidence: vi.fn(),
  deleteNote: vi.fn(),
  deleteTask: vi.fn(),
  deleteTimelineEvent: vi.fn(),
  getEvidenceDownloadUrl: vi.fn(),
  replaceEvidenceFile: vi.fn(),
  updateEvidence: vi.fn(),
  updateNote: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTimelineEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }) } }),
}));

async function fillEvidenceFileForm() {
  const user = userEvent.setup();
  const RealFormData = globalThis.FormData;
  const file = new File(["pdf"], "proof.pdf", { type: "application/pdf" });
  vi.spyOn(globalThis, "FormData").mockImplementation(function () {
    const fd = new RealFormData();
    fd.set("title", "Proof");
    fd.set("type", "PDF");
    fd.set("description", "");
    fd.set("source_url", "");
    fd.set("collection_date", "2026-07-21T00:00");
    fd.set("tags", "");
    fd.set("file", file);
    return fd;
  } as unknown as typeof FormData);
  await user.click(screen.getByRole("button", { name: "Upload file evidence" }));
}


beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("EvidenceUpload client signed upload flow", () => {
  it("passes the required project UUID to signed upload authorization", async () => {
    const { EvidenceUpload } = await import("@/components/workspace-forms");
    render(<EvidenceUpload projectId={PROJECT_ID} />);

    await fillEvidenceFileForm();

    await waitFor(() => expect(authorizeEvidenceUploadMock).toHaveBeenCalled());
    expect((authorizeEvidenceUploadMock.mock.calls as unknown as unknown[][])[0][0]).toBe(PROJECT_ID);
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(`user/${PROJECT_ID}/uuid-proof.pdf`, "token", expect.any(File));
    const authorized = await authorizeEvidenceUploadMock.mock.results[0].value;
    expect((uploadToSignedUrlMock.mock.calls as unknown[][])[0][0]).toBe(authorized.path);
    expect((uploadToSignedUrlMock.mock.calls as unknown[][])[0][1]).toBe(authorized.token);
    expect((finalizeEvidenceUploadMock.mock.calls as unknown as unknown[][])[0][0]).toBe(PROJECT_ID);
    expect(await screen.findByText("Evidence saved.")).toBeInTheDocument();
  });

  it("does not call signed upload authorization when projectId is absent", async () => {
    authorizeEvidenceUploadMock.mockClear();
    uploadToSignedUrlMock.mockClear();
    const { EvidenceUpload } = await import("@/components/workspace-forms");
    render(<EvidenceUpload projectId={undefined as unknown as string} />);

    await fillEvidenceFileForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Project is required before uploading evidence.");
    expect(authorizeEvidenceUploadMock).not.toHaveBeenCalled();
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled();
  });

  it("labels signed upload authorization failures without uploading bytes", async () => {
    authorizeEvidenceUploadMock.mockResolvedValueOnce({ error: "Signed upload authorization failed: new row violates row-level security policy" });
    const { EvidenceUpload } = await import("@/components/workspace-forms");
    render(<EvidenceUpload projectId={PROJECT_ID} />);

    await fillEvidenceFileForm();

    expect(await screen.findByRole("alert")).toHaveTextContent("Signed upload authorization failed: new row violates row-level security policy");
    expect(uploadToSignedUrlMock).not.toHaveBeenCalled();
  });

  it("labels signed byte upload failures separately from authorization", async () => {
    uploadToSignedUrlMock.mockResolvedValueOnce({ error: { message: "network body upload failed" } });
    const { EvidenceUpload } = await import("@/components/workspace-forms");
    render(<EvidenceUpload projectId={PROJECT_ID} />);

    await fillEvidenceFileForm();

    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(`user/${PROJECT_ID}/uuid-proof.pdf`, "token", expect.any(File));
    expect(await screen.findByRole("alert")).toHaveTextContent("Signed byte upload failed: network body upload failed");
    expect(finalizeEvidenceUploadMock).not.toHaveBeenCalled();
  });

  it("labels metadata finalization failures after a successful byte upload", async () => {
    finalizeEvidenceUploadMock.mockResolvedValueOnce({ error: "insert failed" });
    const { EvidenceUpload } = await import("@/components/workspace-forms");
    render(<EvidenceUpload projectId={PROJECT_ID} />);

    await fillEvidenceFileForm();

    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(`user/${PROJECT_ID}/uuid-proof.pdf`, "token", expect.any(File));
    expect(await screen.findByRole("alert")).toHaveTextContent("Evidence metadata finalization failed: insert failed");
  });

});
