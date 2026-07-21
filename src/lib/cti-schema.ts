import { z } from "zod";

export const indicatorTypes = [
  "IP",
  "DOMAIN",
  "URL",
  "HASH",
  "EMAIL",
  "FILE",
  "REGISTRY",
] as const;
export const confidenceLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const cveSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const exploitStatuses = [
  "NONE",
  "POC",
  "WEAPONIZED",
  "ACTIVE_EXPLOITATION",
] as const;
export const ctiTabs = [
  "actors",
  "campaigns",
  "indicators",
  "malware",
  "cves",
  "mitre",
] as const;
export const entityTables = {
  actors: "threat_actors",
  campaigns: "campaigns",
  indicators: "indicators",
  malware: "malware",
  cves: "cves",
  mitre: "mitre_techniques",
} as const;

const csv = z
  .preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(z.string().trim().min(1).max(300)).max(50),
  )
  .default([]);
const dateNull = z
  .preprocess(normalizeDateInput, z.union([z.string(), z.null()]).optional())
  .refine(validDateOrNull, "Use a valid date/time value.")
  .transform((v) => v || null);
const text = (max = 20000) => z.string().trim().max(max).default("");
export const relKeys = [
  "threat_actor_ids",
  "campaign_ids",
  "indicator_ids",
  "malware_ids",
  "cve_ids",
  "mitre_technique_ids",
] as const;
export const relSchema = z.object(
  Object.fromEntries(relKeys.map((k) => [k, csv])) as Record<
    (typeof relKeys)[number],
    typeof csv
  >,
);

export type RelationshipSelections = Record<(typeof relKeys)[number], string[]>;
export function parseRelationshipSelections(
  formData: FormData,
):
  | { success: true; data: RelationshipSelections }
  | { success: false; error: string } {
  const out = Object.fromEntries(
    relKeys.map((key) => [key, [] as string[]]),
  ) as RelationshipSelections;
  for (const key of relKeys) {
    const seen = new Set<string>();
    for (const raw of formData.getAll(key)) {
      const value = String(raw).trim();
      if (!value) continue;
      const parsed = z.string().uuid().safeParse(value);
      if (!parsed.success)
        return {
          success: false,
          error: `${key.replaceAll("_", " ")} contains an invalid ID.`,
        };
      if (!seen.has(parsed.data)) {
        seen.add(parsed.data);
        out[key].push(parsed.data);
      }
    }
  }
  return { success: true, data: out };
}

export function normalizeIndicatorValue(value: string, type: string) {
  const v = value.trim();
  return type === "DOMAIN" || type === "EMAIL" ? v.toLowerCase() : v;
}
export function validateIndicator(value: string, type: string) {
  const v = value.trim();
  if (!v) return "Indicator value is required.";
  if (type === "IP") {
    if (z.ipv4().safeParse(v).success || z.ipv6().safeParse(v).success)
      return null;
    return "Use a valid IPv4 or IPv6 address.";
  }
  if (type === "URL") {
    try {
      const u = new URL(v);
      return ["http:", "https:"].includes(u.protocol)
        ? null
        : "Use an HTTP or HTTPS URL.";
    } catch {
      return "Use a valid HTTP or HTTPS URL.";
    }
  }
  if (type === "DOMAIN")
    return /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(v)
      ? null
      : "Use a valid domain name.";
  if (type === "HASH")
    return /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(v)
      ? null
      : "Use a common MD5, SHA-1, or SHA-256 hex hash.";
  if (type === "EMAIL")
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      ? null
      : "Use a valid email address.";
  return null;
}
function normalizeDateInput(v: unknown) {
  if (v === "" || v == null) return null;
  if (typeof v !== "string") return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}
function validDateOrNull(v: unknown) {
  return (
    v === null ||
    (typeof v === "string" && !Number.isNaN(new Date(v).getTime()))
  );
}
const supportedHashLengths: Record<string, number> = {
  md5: 32,
  sha1: 40,
  sha256: 64,
};
function validateHashObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, raw]) => {
    const expected = supportedHashLengths[key.toLowerCase()];
    return (
      expected !== undefined &&
      typeof raw === "string" &&
      new RegExp(`^[a-fA-F0-9]{${expected}}$`).test(raw)
    );
  });
}
const indicatorValue = z
  .string()
  .trim()
  .min(1)
  .superRefine((v, ctx) => {
    const type = String(
      (ctx as unknown as { parent?: { type?: string } }).parent?.type ?? "",
    );
    const err = type ? validateIndicator(v, type) : null;
    if (err) ctx.addIssue({ code: "custom", message: err });
  });
export const actorSchema = z.object({
  name: z.string().trim().min(1).max(180),
  aliases: csv,
  country: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  motivations: csv,
  description: text(),
  known_ttps: text(),
  references: csv,
});
export const campaignSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    description: text(),
    start_date: dateNull,
    end_date: dateNull,
    targets: csv,
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "End date must be on or after start date.",
  });
export const indicatorSchema = z
  .object({
    value: indicatorValue,
    type: z.enum(indicatorTypes),
    confidence: z.enum(confidenceLevels),
    source: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null),
    tags: csv,
    first_seen: dateNull,
    last_seen: dateNull,
  })
  .superRefine((v, ctx) => {
    const err = validateIndicator(v.value, v.type);
    if (err) ctx.addIssue({ code: "custom", path: ["value"], message: err });
    if (v.first_seen && v.last_seen && v.last_seen < v.first_seen)
      ctx.addIssue({
        code: "custom",
        path: ["last_seen"],
        message: "Last seen must be after first seen.",
      });
  })
  .transform((v) => ({
    ...v,
    value:
      v.type === "HASH"
        ? v.value.trim().toLowerCase()
        : normalizeIndicatorValue(v.value, v.type),
  }));
export const malwareSchema = z.object({
  name: z.string().trim().min(1).max(180),
  family: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  hashes: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return {};
      try {
        const parsed: unknown = JSON.parse(v);
        if (!validateHashObject(parsed)) {
          ctx.addIssue({
            code: "custom",
            message:
              "Hashes must be a JSON object with md5, sha1, or sha256 hex string values.",
          });
          return z.NEVER;
        }
        return Object.fromEntries(
          Object.entries(parsed as Record<string, string>).map(
            ([key, value]) => [key.toLowerCase(), String(value).toLowerCase()],
          ),
        );
      } catch {
        ctx.addIssue({ code: "custom", message: "Hashes must be valid JSON." });
        return z.NEVER;
      }
    }),
  description: text(),
  behavior: text(),
});
export const cveSchema = z.object({
  cve_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^CVE-[0-9]{4}-[0-9]{4,}$/,
      "Use a valid CVE ID such as CVE-2024-12345.",
    ),
  severity: z.enum(cveSeverities),
  description: text(),
  affected_product: z.string().trim().max(300).default(""),
  exploit_status: z.enum(exploitStatuses),
  references: csv,
});
export const mitreSchema = z.object({
  technique_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^T[0-9]{4}(\.[0-9]{3})?$/,
      "Use a MITRE technique ID such as T1059 or T1059.001.",
    ),
  technique_name: z.string().trim().min(1).max(240),
  tactic: z.string().trim().min(1).max(120),
  description: text(),
});
export const schemas = {
  actors: actorSchema,
  campaigns: campaignSchema,
  indicators: indicatorSchema,
  malware: malwareSchema,
  cves: cveSchema,
  mitre: mitreSchema,
};
export function formObj(fd: FormData) {
  return Object.fromEntries(fd.entries());
}
export const ctiModuleLabels = {
  actors: "Threat Actor",
  campaigns: "Campaign",
  indicators: "Indicator",
  malware: "Malware",
  cves: "CVE",
  mitre: "MITRE Technique",
} as const;
export function ctiRecordTitle(row: Record<string, unknown>) {
  return String(
    row.name ?? row.value ?? row.cve_id ?? row.technique_id ?? "CTI record",
  );
}
export function ctiDetailPath(
  projectId: string,
  tab: keyof typeof entityTables,
  id: string,
) {
  return `/projects/${projectId}/${tab}/${id}`;
}
export function buildRelationshipRpcPayload(
  tab: keyof typeof entityTables,
  selections: Record<string, string[]>,
) {
  return {
    p_entity_type: tab,
    p_threat_actor_ids: selections.threat_actor_ids ?? [],
    p_campaign_ids: selections.campaign_ids ?? [],
    p_indicator_ids: selections.indicator_ids ?? [],
    p_malware_ids: selections.malware_ids ?? [],
    p_cve_ids: selections.cve_ids ?? [],
    p_mitre_technique_ids: selections.mitre_technique_ids ?? [],
  };
}
