import { describe, expect, it } from "vitest";

import {
  observationSourceLinkSchema,
  sourceSchema,
} from "@/lib/sources/schema";

const valid = {
  title: "Synthetic Vendor Report",
  source_type: "VENDOR_REPORT",
  publisher: "Example CTI Research",
  url: "https://example.com/reports/synthetic-energy-phishing",
  published_at: "2026-07-01T10:00:00.000Z",
  accessed_at: "2026-07-28T10:00:00.000Z",
  reliability: "MEDIUM",
  verification_state: "VERIFIED",
  description: "Synthetic acceptance source for Phase 2.1B.",
  analyst_notes: "",
  evidence_id: null,
} as const;

describe("Source Registry validation", () => {
  it("accepts a bounded structured Source", () => {
    expect(sourceSchema.parse(valid)).toMatchObject({
      title: valid.title,
      source_type: "VENDOR_REPORT",
      reliability: "MEDIUM",
      verification_state: "VERIFIED",
    });
  });

  it("requires a title", () => {
    expect(sourceSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("rejects non-http protocols and credential-bearing URLs", () => {
    expect(sourceSchema.safeParse({ ...valid, url: "file:///etc/passwd" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, url: "https://user:secret@example.com/report" }).success).toBe(false);
  });

  it("enforces publisher, type, reliability and verification bounds", () => {
    expect(sourceSchema.safeParse({ ...valid, publisher: "x".repeat(241) }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, source_type: "UNKNOWN_TYPE" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, reliability: "CERTAIN" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, verification_state: "APPROVED" }).success).toBe(false);
  });

  it("validates publication/access dates and optional Evidence IDs", () => {
    expect(sourceSchema.safeParse({ ...valid, published_at: "not-a-date" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, accessed_at: "not-a-date" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, evidence_id: "not-a-uuid" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...valid, evidence_id: "" }).success).toBe(true);
  });

  it("accepts linking, replacing and removing an observation Source", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(observationSourceLinkSchema.parse({ source_id: id, verification_state: "VERIFIED" })).toEqual({ source_id: id, verification_state: "VERIFIED" });
    expect(observationSourceLinkSchema.parse({ source_id: "", verification_state: "DISPUTED" })).toEqual({ source_id: null, verification_state: "DISPUTED" });
  });
});
