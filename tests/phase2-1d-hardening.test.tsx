import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { forgotPassword, signIn, signUp, updatePassword } from "@/app/actions";
import { EntityLinkForm, SupportLinkForms } from "@/components/reconstruction/forms";
import {
  timelineDeletionMessage,
  validTimelineDate,
  visibleCampaignActivity,
} from "@/lib/reconstruction/presentation";

const authError = { message: "provider unavailable", status: 503 };
const form = (values: Record<string, string>) => {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  return result;
};

describe("Phase 2.1D authentication regression", () => {
  beforeEach(() => {
    createClient.mockReset();
    createClient.mockResolvedValue({ auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: authError }),
      signUp: vi.fn().mockResolvedValue({ error: authError }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: authError }),
      updateUser: vi.fn().mockResolvedValue({ error: authError }),
    } });
  });

  it("keeps sign-in and sign-up errors authentication-specific", async () => {
    expect((await signIn({}, form({ email: "a@example.test", password: "password" }))).error).toContain("sign in");
    expect((await signUp({}, form({ email: "a@example.test", password: "password", display_name: "A" }))).error).toContain("sign up");
  });

  it("keeps recovery and password-update errors authentication-specific", async () => {
    const recovery = await forgotPassword({}, form({ email: "a@example.test" }));
    const update = await updatePassword({}, form({ password: "long-password" }));
    expect(recovery.error).toContain("password reset link");
    expect(update.error).toContain("update the password");
    expect(`${recovery.error} ${update.error}`).not.toMatch(/Timeline event/i);
  });
});

describe("Phase 2.1D selectors", () => {
  it("changes technical entity choices by type and never asks for a UUID", async () => {
    const user = userEvent.setup();
    render(<EntityLinkForm projectId="p" eventId="e" options={{
      indicator: [{ id: "indicator-id", value: "198.51.100.1", type: "IP" }],
      infrastructure_cluster: [{ id: "cluster-id", name: "Relay cluster" }],
      malware: [{ id: "malware-id", name: "Loader" }],
      cve: [{ id: "cve-id", cve_id: "CVE-2026-1000" }],
      mitre_technique: [{ id: "mitre-id", technique_id: "T1059", technique_name: "Command" }],
    }} />);
    expect(screen.getByRole("option", { name: /198\.51\.100\.1 · IP/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Entity type"), "cve");
    expect(screen.getByRole("option", { name: "CVE-2026-1000" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/UUID/i)).not.toBeInTheDocument();
  });

  it("renders separate type-safe support selectors", () => {
    render(<SupportLinkForms projectId="p" eventId="e" sources={[{ id: "s", title: "Internal source" }]} evidence={[{ id: "v", title: "Packet capture" }]} enrichment={[{ id: "r", category: "DNS", queried_at: "2026-07-30" }]} />);
    expect(screen.getByRole("option", { name: "Internal source" }).closest("select")).toHaveAttribute("name", "support_id");
    expect(screen.getByRole("option", { name: "Packet capture" }).closest("select")).not.toContainElement(screen.getByRole("option", { name: /DNS/ }));
  });
});

describe("Phase 2.1D hardening contracts", () => {
  it("blocks active memberships and permits deletion only after history is unlinked", () => {
    expect(timelineDeletionMessage([])).toBeNull();
    expect(timelineDeletionMessage(["POSSIBLE"])).toMatch(/Reject or remove active/);
    expect(timelineDeletionMessage(["CONFIRMED"])).toMatch(/Reject or remove active/);
    expect(timelineDeletionMessage(["REJECTED"])).toMatch(/Explicitly unlink/);
    expect(timelineDeletionMessage(["REMOVED"])).toMatch(/Explicitly unlink/);
  });

  it("separates active and historical Campaign activity with deterministic ordering", () => {
    const rows = [
      { id: "b", status: "CONFIRMED", sequence_order: 2, timeline_events: { event_date: "2026-01-01", assessment_status: "ASSESSED" } },
      { id: "a", status: "POSSIBLE", sequence_order: 1, timeline_events: { event_date: "2026-01-01", assessment_status: "RECORDED" } },
      { id: "c", status: "REMOVED", timeline_events: { event_date: "2026-01-02", assessment_status: "ASSESSED" } },
      { id: "d", status: "CONFIRMED", timeline_events: { event_date: "2026-01-03", assessment_status: "RETRACTED" } },
    ];
    expect(visibleCampaignActivity(rows, false).map((row) => row.id)).toEqual(["a", "b"]);
    expect(visibleCampaignActivity(rows, true).map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("validates Timeline date filters", () => {
    expect(validTimelineDate("2026-07-30")).toBe("2026-07-30");
    expect(validTimelineDate("not-a-date")).toBeUndefined();
  });

  it("enforces historical-only membership deletion in migration 020", () => {
    const sql = readFileSync("supabase/migrations/202607300020_phase2_1d_campaign_reconstruction.sql", "utf8");
    expect(sql).toContain("status in ('REJECTED','REMOVED')");
    expect(sql).toContain("prevent_active_campaign_timeline_event_delete");
    expect(sql).toContain("on delete restrict");
  });

  it("keeps Timeline events out of Graph entity types", () => {
    const types = readFileSync("src/lib/graph/types.ts", "utf8");
    expect(types).not.toMatch(/TIMELINE_EVENT/);
  });
});
