import { z } from "zod";

export const evidenceTypes = [
  "SCREENSHOT",
  "PDF",
  "ARTICLE",
  "TWEET",
  "FILE",
  "LOG",
  "PCAP",
] as const;
export const urlEvidenceTypes = ["ARTICLE", "TWEET"] as const;
export const fileEvidenceTypes = [
  "SCREENSHOT",
  "PDF",
  "FILE",
  "LOG",
  "PCAP",
] as const;
export const taskStatuses = ["TODO", "IN_PROGRESS", "COMPLETED"] as const;
export const taskPriorities = ["LOW", "MEDIUM", "HIGH"] as const;

const tags = z
  .preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : v,
    z.array(z.string().trim().min(1).max(40)).max(20),
  )
  .default([]);

export const noteSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  content: z.string().max(50000).default(""),
  tags,
});

export const requiredUuidSchema = z.string().trim().uuid();
export const optionalUuidSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().uuid().nullable().optional(),
);

const httpUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => {
    if (!v) return true;
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Use an http or https URL");

export const evidenceMetadataSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
  type: z.enum(evidenceTypes),
  description: z.string().max(10000).default(""),
  source_url: httpUrl,
  collection_date: z
    .string()
    .min(1)
    .transform((v) => new Date(v).toISOString()),
  tags,
});

export const evidenceFileMetadataSchema = evidenceMetadataSchema.extend({
  type: z.enum(fileEvidenceTypes, {
    message: "Uploaded evidence must use a file-backed evidence type.",
  }),
});

export const evidenceFinalizeSchema = evidenceFileMetadataSchema
  .extend({
    storage_path: z.string().min(1),
    original_file_name: z.string().min(1).max(255),
    mime_type: z.string().min(1).max(160),
    file_size: z.coerce
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
  })
  .superRefine((value, context) => {
    const expected = evidenceTypeForFile({
      name: value.original_file_name,
      type: value.mime_type,
    });
    if (!expected || expected !== value.type)
      context.addIssue({
        code: "custom",
        message: "Evidence type does not match the uploaded file.",
      });
  });

export const evidenceReplacementSchema = z.object({
  storage_path: z.string().min(1),
  original_file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(160),
  file_size: z.coerce
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024),
});

export const evidenceUrlOnlySchema = evidenceMetadataSchema
  .extend({
    type: z.enum(urlEvidenceTypes, {
      message: "URL evidence must be ARTICLE or TWEET.",
    }),
  })
  .superRefine((v, ctx) => {
    if (!v.source_url)
      ctx.addIssue({
        code: "custom",
        message:
          "A valid HTTP or HTTPS source URL is required for URL evidence.",
      });
  });

export const timelineSchema = z
  .object({
    event_name: z.string().trim().min(1, "Event name is required").max(180),
    event_date: z
      .string()
      .min(1)
      .transform((v) => new Date(v).toISOString()),
    description: z.string().max(10000).default(""),
    related_entity_type: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null),
    related_entity_id: optionalUuidSchema.transform((v) => v ?? null),
    occurred_end_at: z
      .string()
      .optional()
      .transform((v) => (v ? new Date(v).toISOString() : null)),
    basis: z.enum(["OBSERVED", "INFERRED"]).default("OBSERVED"),
    activity_phase: z
      .enum([
        "INFRASTRUCTURE_PREPARATION",
        "TARGETING",
        "DELIVERY",
        "INITIAL_ACCESS",
        "EXECUTION",
        "PERSISTENCE",
        "COMMAND_AND_CONTROL",
        "COLLECTION",
        "EXFILTRATION",
        "IMPACT",
        "INFRASTRUCTURE_CHANGE",
        "OTHER",
        "UNKNOWN",
      ])
      .default("UNKNOWN"),
    assessment_status: z
      .enum(["RECORDED", "ASSESSED", "DISPUTED", "RETRACTED"])
      .default("RECORDED"),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    analyst_rationale: z.string().max(10000).default(""),
  })
  .superRefine((v, ctx) => {
    if (
      v.occurred_end_at &&
      new Date(v.event_date) > new Date(v.occurred_end_at)
    )
      ctx.addIssue({
        code: "custom",
        message: "Event end must not precede its start.",
      });
    if (
      (v.basis === "INFERRED" ||
        ["DISPUTED", "RETRACTED"].includes(v.assessment_status)) &&
      !v.analyst_rationale.trim()
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Analyst rationale is required for inferred, disputed, or retracted events.",
      });
  });

export const taskSchema = z.object({
  task_name: z.string().trim().min(1, "Task name is required").max(180),
  description: z.string().max(10000).default(""),
  status: z.enum(taskStatuses),
  priority: z.enum(taskPriorities),
  assigned_user_id: optionalUuidSchema.transform((v) => v ?? null),
  deadline: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v).toISOString() : null)),
});

export const uploadAuthorizeSchema = evidenceFileMetadataSchema
  .extend({
    file_name: z.string().min(1).max(255),
    mime_type: z.string().min(1).max(160),
    file_size: z.coerce
      .number()
      .int()
      .min(1)
      .max(20 * 1024 * 1024),
  })
  .superRefine((value, context) => {
    const expected = evidenceTypeForFile({
      name: value.file_name,
      type: value.mime_type,
    });
    if (!expected || expected !== value.type)
      context.addIssue({
        code: "custom",
        message: "Evidence type does not match the uploaded file.",
      });
  });

export function evidenceTypeForFile(file: { name: string; type: string }) {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (
    [".png", ".jpg", ".jpeg"].includes(ext ?? "") &&
    ["image/png", "image/jpeg"].includes(file.type)
  )
    return "SCREENSHOT" as const;
  if (ext === ".pdf" && file.type === "application/pdf") return "PDF" as const;
  if (
    ext === ".pcap" &&
    ["application/vnd.tcpdump.pcap", "application/octet-stream"].includes(
      file.type,
    )
  )
    return "PCAP" as const;
  if (
    ext === ".log" &&
    ["text/plain", "text/x-log", "application/octet-stream"].includes(file.type)
  )
    return "LOG" as const;
  if (ext === ".txt" && file.type === "text/plain") return "FILE" as const;
  return null;
}

export function sanitizeFileName(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+(?=\.)/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 120) || "evidence-file"
  );
}
export function buildEvidencePath(
  userId: string,
  projectId: string,
  fileName: string,
  uuid = crypto.randomUUID(),
) {
  return `${userId}/${projectId}/${uuid}-${sanitizeFileName(fileName)}`;
}
export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}) {
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const allowed = new Map([
    [".png", ["image/png"]],
    [".jpg", ["image/jpeg"]],
    [".jpeg", ["image/jpeg"]],
    [".pdf", ["application/pdf"]],
    [".pcap", ["application/vnd.tcpdump.pcap", "application/octet-stream"]],
    [".log", ["text/plain", "text/x-log", "application/octet-stream"]],
    [".txt", ["text/plain"]],
  ]);
  if (!ext || !allowed.has(ext)) return "Unsupported file extension.";
  if (!allowed.get(ext)!.includes(file.type))
    return "File MIME type does not match the allowed category.";
  if (file.size > 20 * 1024 * 1024)
    return "Evidence files must be 20 MB or smaller.";
  return null;
}
export function isEvidencePathScoped(
  path: string,
  userId: string,
  projectId: string,
) {
  return (
    path.startsWith(`${userId}/${projectId}/`) && path.split("/").length === 3
  );
}
export function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
