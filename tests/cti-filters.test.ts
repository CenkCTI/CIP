import { describe, expect, it } from "vitest";
import {
  filterCampaigns,
  filterIndicators,
  filterMalware,
} from "@/lib/cti-filters";
import {
  formatDateInput as schemaDate,
  formatDateTimeLocalInput as schemaDateTime,
} from "@/lib/cti-schema";
const rels = {
  campaignThreatActors: [{ campaign_id: "c1", threat_actor_id: "a1" }],
  threatActorMalware: [{ malware_id: "m1", threat_actor_id: "a1" }],
  campaignMalware: [{ malware_id: "m1", campaign_id: "c1" }],
};
describe("cti filter helpers", () => {
  it("filters active campaigns by date and linked actor", () => {
    const rows = [
      { id: "c1", name: "one", start_date: "2026-01-01", end_date: null },
      { id: "c2", name: "two", start_date: "2027-01-01", end_date: null },
    ];
    expect(
      filterCampaigns(
        rows,
        { active: "true", actor: "a1" },
        rels,
        new Date("2026-07-21"),
      ).map((r) => r.id),
    ).toEqual(["c1"]);
  });
  it("filters campaigns by start and end range", () => {
    const rows = [
      {
        id: "c1",
        name: "one",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      },
      {
        id: "c2",
        name: "two",
        start_date: "2026-05-01",
        end_date: "2026-06-01",
      },
    ];
    expect(
      filterCampaigns(
        rows,
        { start: "2026-04-01", end: "2026-07-01" },
        {},
        new Date("2026-07-21"),
      ).map((r) => r.id),
    ).toEqual(["c2"]);
  });
  it("filters indicators by bounds and tag", () => {
    const rows = [
      {
        id: "i1",
        value: "a",
        type: "DOMAIN",
        confidence: "HIGH",
        tags: ["x"],
        first_seen: "2026-01-01",
        last_seen: "2026-02-01",
      },
      {
        id: "i2",
        value: "b",
        type: "IP",
        confidence: "LOW",
        tags: ["y"],
        first_seen: "2025-01-01",
        last_seen: "2027-01-01",
      },
    ];
    expect(
      filterIndicators(rows, {
        type: "DOMAIN",
        confidence: "HIGH",
        tag: "x",
        first: "2026-01-01",
        last: "2026-12-01",
      }).map((r) => r.id),
    ).toEqual(["i1"]);
  });
  it("filters malware by family and linked actor/campaign", () => {
    const rows = [
      { id: "m1", name: "M", family: "fam" },
      { id: "m2", name: "N", family: "fam" },
    ];
    expect(
      filterMalware(
        rows,
        { family: "fam", actor: "a1", campaign: "c1" },
        rels,
      ).map((r) => r.id),
    ).toEqual(["m1"]);
  });
  it("formats date and datetime defaults for form inputs", () => {
    expect(schemaDate("2026-07-21T15:30:10.000Z")).toBe("2026-07-21");
    expect(schemaDateTime("2026-07-21T15:30:10.000Z")).toBe("2026-07-21T15:30");
  });
});
