import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const authorizeEvidenceUploadMock = vi.fn(async () => ({ path: `user/${PROJECT_ID}/uuid-proof.pdf`, token: "token" }));
const finalizeEvidenceUploadMock = vi.fn(async () => ({ success: "Evidence saved." }));
const createUrlEvidenceMock = vi.fn(async () => ({ success: "Evidence saved." }));
const uploadToSignedUrlMock = vi.fn(async () => ({ error: null }));

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
});
