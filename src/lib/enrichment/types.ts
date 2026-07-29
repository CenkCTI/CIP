import { z } from "zod";

import { indicatorTypes, type IndicatorType } from "@/lib/cti/indicators";

export const enrichmentResultCategories = [
  "NETWORK",
  "DNS",
  "REGISTRATION",
  "CERTIFICATE",
  "REPUTATION",
  "MALWARE",
  "RELATED_INDICATOR",
  "OTHER",
] as const;

export type EnrichmentResultCategory = (typeof enrichmentResultCategories)[number];

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/<(?:script|iframe|object|embed|style|link)\b/i.test(value), "Executable or embedded markup is not accepted.");

const attributeValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const normalizedRelatedIndicatorSchema = z
  .object({
    type: z.enum(indicatorTypes),
    value: z.string().trim().min(1).max(8000),
    relationship: safeText(80),
  })
  .strict();

export const providerVerdictSchema = z
  .object({
    label: safeText(120),
    score: z.number().int().min(0).max(100).nullable().default(null),
  })
  .strict();

export const normalizedEnrichmentDataSchema = z
  .object({
    schema_version: z.literal(1),
    summary: safeText(1000),
    attributes: z
      .record(z.string().trim().min(1).max(80), attributeValueSchema)
      .refine((value) => Object.keys(value).length <= 32, "Too many normalized attributes."),
    related_indicators: z.array(normalizedRelatedIndicatorSchema).max(20).default([]),
    provider_verdict: providerVerdictSchema.nullable().default(null),
    synthetic_notice: safeText(300).nullable().default(null),
  })
  .strict();

export const providerResultSchema = z
  .object({
    category: z.enum(enrichmentResultCategories),
    normalized: normalizedEnrichmentDataSchema,
    provider_observed_at: z.string().datetime().nullable().default(null),
    expires_at: z.string().datetime().nullable().default(null),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().default(null),
    sanitized_raw: z.record(z.string(), z.unknown()).nullable().default(null),
  })
  .strict();

export const providerResponseSchema = z
  .object({
    results: z.array(providerResultSchema).min(1).max(12),
  })
  .strict();

export type NormalizedEnrichmentData = z.infer<typeof normalizedEnrichmentDataSchema>;
export type ProviderResult = z.infer<typeof providerResultSchema>;
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export type EnrichmentQueryInput = {
  indicatorType: IndicatorType;
  canonicalValue: string;
  signal: AbortSignal;
  context: {
    projectId: string;
    indicatorId: string;
    maxResults: number;
  };
};

export type EnrichmentProvider = {
  id: string;
  displayName: string;
  isSynthetic: boolean;
  supportedIndicatorTypes: readonly IndicatorType[];
  configured: boolean;
  enabled: boolean;
  fixedBaseUrl: string | null;
  requestTimeoutMs: number;
  freshnessSeconds: number;
  dataSharingWarning: string;
  responseSchema: typeof providerResponseSchema;
  query(input: EnrichmentQueryInput): Promise<unknown>;
};

export type PublicEnrichmentProvider = {
  id: string;
  displayName: string;
  isSynthetic: boolean;
  supportedIndicatorTypes: readonly IndicatorType[];
  configured: boolean;
  enabled: boolean;
  dataSharingWarning: string;
};
