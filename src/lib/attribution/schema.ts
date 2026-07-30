import { z } from "zod";
const uuid = z.string().uuid(),
  text = (n: number, required = false) =>
    required ? z.string().trim().min(1).max(n) : z.string().trim().max(n);
const confidence = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const hypothesisSchema = z
  .object({
    title: text(180, true),
    subject_kind: z.enum([
      "EXISTING_THREAT_ACTOR",
      "ACTOR_CLASS",
      "UNKNOWN_ACTOR",
      "NON_ATTRIBUTION_ALTERNATIVE",
    ]),
    threat_actor_id: z.string().optional(),
    subject_label: text(180),
    proposition: text(10000, true),
    status: z.enum(["DRAFT", "ACTIVE", "DISFAVORED", "REJECTED"]),
    confidence,
    analytic_rationale: text(20000),
    key_assumptions: text(20000),
    known_weaknesses: text(20000),
    information_gaps: text(20000),
    status_rationale: text(10000),
  })
  .superRefine((v, c) => {
    const actor = v.threat_actor_id?.trim();
    if (
      v.subject_kind === "EXISTING_THREAT_ACTOR" &&
      !uuid.safeParse(actor).success
    )
      c.addIssue({ code: "custom", message: "Select a Threat Actor." });
    if (
      v.subject_kind !== "EXISTING_THREAT_ACTOR" &&
      (actor || !v.subject_label)
    )
      c.addIssue({
        code: "custom",
        message:
          "Non-actor hypotheses require a subject label and cannot reference a Threat Actor.",
      });
    if (v.status === "ACTIVE" && !v.analytic_rationale)
      c.addIssue({
        code: "custom",
        message: "Active hypotheses require an analytic rationale.",
      });
    if (["DISFAVORED", "REJECTED"].includes(v.status) && !v.status_rationale)
      c.addIssue({
        code: "custom",
        message: "This status requires a rationale.",
      });
  });
export const assessmentSchema = z
  .object({
    assessment_status: z.enum(["DRAFT", "ASSESSED"]),
    conclusion_type: z.enum([
      "UNRESOLVED",
      "PREFERRED_HYPOTHESIS",
      "MULTIPLE_PLAUSIBLE",
      "INSUFFICIENT_EVIDENCE",
      "ATTRIBUTION_WITHHELD",
    ]),
    confidence,
    preferred_hypothesis_id: z.string().optional(),
    current_judgment: text(20000),
    alternative_explanations: text(20000),
    key_uncertainties: text(20000),
    discriminating_information_needed: text(20000),
    assessed_at: z.string().optional(),
  })
  .superRefine((v, c) => {
    if (
      v.assessment_status === "ASSESSED" &&
      (!v.current_judgment || !v.assessed_at)
    )
      c.addIssue({
        code: "custom",
        message:
          "An assessed judgement requires judgement text and assessed time.",
      });
    const preferred = v.preferred_hypothesis_id?.trim();
    if ((v.conclusion_type === "PREFERRED_HYPOTHESIS") !== Boolean(preferred))
      c.addIssue({
        code: "custom",
        message:
          "A preferred hypothesis is required only for a preferred-hypothesis conclusion.",
      });
  });
export const evidenceSchema = z.object({
  title: text(180, true),
  relevance_note: text(10000, true),
  reference_type: z.enum([
    "source",
    "evidence",
    "timeline_event",
    "infrastructure_cluster",
    "indicator",
    "enrichment_result",
    "malware",
    "mitre_technique",
  ]),
  reference_id: uuid,
});
export const evaluationSchema = z.object({
  hypothesis_id: uuid,
  evidence_item_id: uuid,
  impact: z.enum(["SUPPORTS", "CONTRADICTS", "NEUTRAL"]),
  diagnostic_value: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationale: text(10000, true),
});
