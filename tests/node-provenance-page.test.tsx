import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { provenanceSchema } from "@/lib/baykush-node/schemas";

const { requireUser, getNodeProvenance } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getNodeProvenance: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/baykush-node/queries", () => ({ getNodeProvenance }));

const provenance = {
  measurement: {
    key: "vulnerability.nvd.publications",
    contractVersion: "v1",
    calculationVersion: "v1",
    unit: "RECORDS",
    timeAxis: "SOURCE_PUBLISHED_TIME",
    populationProfile: null,
    represents: "Distinct retained NVD CVE publications.",
    doesNotRepresent: "Observed exploitation, attacks, or victims.",
    futureMeasurementField: "preserved by passthrough",
  },
  revision: {
    id: "11111111-1111-4111-8111-111111111111",
    revisionNumber: 2,
  },
  inputs: [{ fact_key: "bounded-input" }],
  futureTopLevelField: true,
};

describe("Node measurement provenance page", () => {
  it("renders an explicit unknown state when current Node provenance fails", async () => {
    requireUser.mockResolvedValueOnce({ user: { id: "local-test-user" } });
    getNodeProvenance.mockRejectedValueOnce(new Error("unavailable"));
    const Page = (await import("@/app/techint/global/provenance/[revisionId]/page")).default;
    render(await Page({params:Promise.resolve({revisionId:provenance.revision.id}),searchParams:Promise.resolve({})}));
    expect(screen.getByRole("status")).toHaveTextContent("DEGRADED · provenance UNKNOWN");
    expect(screen.getByRole("status")).not.toHaveTextContent("0");
  });

  it("validates forward-compatible Node semantics and renders Node-returned contract truth", async () => {
    const parsed = provenanceSchema.parse(provenance);
    expect(parsed.measurement.futureMeasurementField).toBe("preserved by passthrough");
    expect(parsed.futureTopLevelField).toBe(true);
    requireUser.mockResolvedValueOnce({ user: { id: "local-test-user" } });
    getNodeProvenance.mockResolvedValueOnce({
      apiVersion: "v1",
      generatedAt: "2026-08-13T18:00:00.000Z",
      data: parsed,
    });
    const Page = (await import("@/app/techint/global/provenance/[revisionId]/page")).default;
    const element = await Page({
      params: Promise.resolve({ revisionId: provenance.revision.id }),
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(screen.getByText("Contract/calculation: v1 / v1")).toBeInTheDocument();
    expect(screen.getByText(`Represents: ${provenance.measurement.represents}`)).toBeInTheDocument();
    expect(screen.getByText(`Does not represent: ${provenance.measurement.doesNotRepresent}`)).toBeInTheDocument();
    expect(getNodeProvenance).toHaveBeenCalledWith(provenance.revision.id);
  });
});
