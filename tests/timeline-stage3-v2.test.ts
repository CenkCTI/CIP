import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { timelineV2FormSchema } from "@/lib/workspace/schema";
import { timelineTimeLabel } from "@/lib/timeline/presentation";

const base = {
  event_name: "Observed activity",
  occurred_end_at: "",
  time_label: "",
  description: "",
  basis: "OBSERVED",
  activity_phase: "UNKNOWN",
  assessment_status: "RECORDED",
  confidence: "MEDIUM",
  analyst_rationale: "",
};

describe("Timeline Stage 3 v2", () => {
  it("normalizes day, month and year precision without exposing false display precision", () => {
    const day = timelineV2FormSchema.parse({
      ...base,
      time_precision: "DAY",
      event_date: "2024-05-08",
    });
    expect(day.event_date).toBe("2024-05-08T00:00:00.000Z");
    expect(day.occurred_end_at).toBeNull();

    const month = timelineV2FormSchema.parse({
      ...base,
      time_precision: "MONTH",
      event_date: "2024-05",
    });
    expect(month.event_date).toBe("2024-05-01T00:00:00.000Z");
    expect(month.occurred_end_at).toBe("2024-05-31T23:59:59.999Z");

    const year = timelineV2FormSchema.parse({
      ...base,
      time_precision: "YEAR",
      event_date: "2022",
    });
    expect(year.event_date).toBe("2022-01-01T00:00:00.000Z");
    expect(year.occurred_end_at).toBe("2022-12-31T23:59:59.999Z");
  });

  it("requires explicit wording for approximate time and an end for ranges", () => {
    expect(
      timelineV2FormSchema.safeParse({
        ...base,
        time_precision: "APPROXIMATE",
        event_date: "2022-02-01",
      }).success,
    ).toBe(false);

    expect(
      timelineV2FormSchema.safeParse({
        ...base,
        time_precision: "APPROXIMATE",
        event_date: "2022-02-01",
        time_label: "Early February 2022",
      }).success,
    ).toBe(true);

    expect(
      timelineV2FormSchema.safeParse({
        ...base,
        time_precision: "RANGE",
        event_date: "2024-03-01",
      }).success,
    ).toBe(false);
  });

  it("keeps analyst rationale mandatory for inferred events", () => {
    expect(
      timelineV2FormSchema.safeParse({
        ...base,
        time_precision: "DAY",
        event_date: "2024-05-08",
        basis: "INFERRED",
      }).success,
    ).toBe(false);
    expect(
      timelineV2FormSchema.safeParse({
        ...base,
        time_precision: "DAY",
        event_date: "2024-05-08",
        basis: "INFERRED",
        analyst_rationale: "Timing and infrastructure overlap.",
      }).success,
    ).toBe(true);
  });

  it("formats analyst-facing temporal precision", () => {
    expect(
      timelineTimeLabel({
        event_date: "2024-05-01T00:00:00.000Z",
        occurred_end_at: "2024-05-31T23:59:59.999Z",
        time_precision: "MONTH",
      }),
    ).toBe("May 2024");

    expect(
      timelineTimeLabel({
        event_date: "2022-02-01T00:00:00.000Z",
        time_precision: "APPROXIMATE",
        time_label: "Early February 2022",
      }),
    ).toBe("Early February 2022");
  });

  it("defines exact annotation provenance and owner-scoped controls in migration 057", () => {
    const sql = readFileSync(
      "supabase/migrations/202609300057_timeline_stage3_workflow_v2.sql",
      "utf8",
    );
    expect(sql).toContain("timeline_time_precision");
    expect(sql).toContain("timeline_event_source_annotations");
    expect(sql).toContain("references public.source_annotations(project_id,id)");
    expect(sql).toContain("references public.timeline_events(project_id,id)");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("public.project_is_owned(project_id)");
  });
});
