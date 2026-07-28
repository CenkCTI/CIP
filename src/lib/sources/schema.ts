import { z } from "zod";

export const sourceTypes = [
  "VENDOR_REPORT",
  "CERT_ADVISORY",
  "RESEARCH_BLOG",
  "THREAT_FEED",
  "ENRICHMENT_PROVIDER",
  "MALWARE_SANDBOX",
  "TECHNICAL_REPORT",
  "WEB_PAGE",
  "ANALYST_OBSERVATION",
  "OTHER",
] as const;

export const sourceReliabilities = ["HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;
export const sourceOrigins = ["ANALYST", "SYSTEM", "PROVIDER", "AI", "IMPORT"] as const;
export const verificationStates = ["UNVERIFIED", "VERIFIED", "DISPUTED", "REJECTED"] as const;

const nullableDate = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z
    .union([z.string(), z.null()])
    .refine(
      (value) =>
        value === null ||
        (typeof value === "string" && !Number.isNaN(new Date(value).getTime())),
      "Use a valid date and time.",
    )
    .transform((value) => (value === null ? null : new Date(value).toISOString())),
);

const nullableUuid = z.preprocess(
  (value) => (value === "" || value == null ? null : value),
  z.union([z.string().uuid(), z.null()]),
);

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .transform((value) => value || null)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "Use an HTTP or HTTPS URL without embedded credentials.");

export const sourceSchema = z
  .object({
    title: z.string().trim().min(1, "Source title is required.").max(240),
    source_type: z.enum(sourceTypes),
    publisher: z
      .string()
      .trim()
      .max(240)
      .optional()
      .transform((value) => value || null),
    url: optionalHttpUrl,
    published_at: nullableDate.default(null),
    accessed_at: nullableDate.default(null),
    reliability: z.enum(sourceReliabilities).default("UNKNOWN"),
    verification_state: z.enum(verificationStates).default("UNVERIFIED"),
    description: z.string().trim().max(10000).optional().default(""),
    analyst_notes: z.string().trim().max(20000).optional().default(""),
    evidence_id: nullableUuid.default(null),
  })
  .strict();

export const sourceIdSchema = z.string().uuid();
export const observationSourceLinkSchema = z
  .object({
    source_id: nullableUuid.default(null),
    verification_state: z.enum(verificationStates).default("UNVERIFIED"),
  })
  .strict();

export type SourceInput = z.infer<typeof sourceSchema>;
export type SourceRecord = SourceInput & {
  id: string;
  project_id: string;
  origin_kind: (typeof sourceOrigins)[number];
  external_key: string | null;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export function sourceFormObject(formData: FormData) {
  return {
    title: formData.get("title"),
    source_type: formData.get("source_type"),
    publisher: formData.get("publisher") ?? "",
    url: formData.get("url") ?? "",
    published_at: formData.get("published_at") ?? "",
    accessed_at: formData.get("accessed_at") ?? "",
    reliability: formData.get("reliability") ?? "UNKNOWN",
    verification_state: formData.get("verification_state") ?? "UNVERIFIED",
    description: formData.get("description") ?? "",
    analyst_notes: formData.get("analyst_notes") ?? "",
    evidence_id: formData.get("evidence_id") ?? "",
  };
}

export function formatSourceDateInput(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}
